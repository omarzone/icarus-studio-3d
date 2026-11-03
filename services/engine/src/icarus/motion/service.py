"""The motion workspace of each project: its reference clip, tracking it with the pose model, imitating it in
training and reading back what the trained body did (ADR 015)."""

import threading
from dataclasses import dataclass

import numpy as np

from icarus.contracts.motion import (
    MotionChoice,
    MotionClip,
    MotionComparison,
    MotionExportFile,
    MotionExportRequest,
    MotionTracking,
    MotionTrain,
    MotionVideoUpload,
    MotionWorkspace,
)
from icarus.contracts.operations import OperationBatch
from icarus.contracts.training import RunStatus, StartRun, WarmStart
from icarus.copilot.client import capability_client
from icarus.copilot.settings import ModelSettingsStore
from icarus.motion.clip_store import ClipStore, UnknownClip
from icarus.motion.comparison import compare, imitation_runs, latest_rollout
from icarus.motion.export import export_motion
from icarus.motion.imitation import imitation_operations
from icarus.motion.pose_tracking import NO_POSE_MODEL, TrackingBoard, track_clip
from icarus.motion.retarget import SEGMENTS, build_reference, facing, segment_angle
from icarus.projects.store import ProjectStore
from icarus.tasks import TaskContext, TaskRegistry
from icarus.training.run_store import RunStore
from icarus.training.schedule import RECOMMENDED_STEPS
from icarus.training.settings import TrainingSettingsStore
from icarus.training.supervisor import Supervisor

# A tracked clip practices its weakest moment for this long, in seconds.
FOCUS_SECONDS = 1.0


class NoPoseModel(Exception):
    """No pose model is connected, so a video cannot be tracked."""


class NoClip(LookupError):
    """The project has no reference clip yet."""


class TrackingBusy(Exception):
    pass


@dataclass(frozen=True)
class MotionServices:
    store: ProjectStore
    runs: RunStore
    supervisor: Supervisor
    training: TrainingSettingsStore
    models: ModelSettingsStore
    tasks: TaskRegistry
    clips: ClipStore


class MotionService:
    def __init__(self, services: MotionServices) -> None:
        self.services = services
        self.board = TrackingBoard()
        self._lock = threading.Lock()
        self._compared: dict[tuple[str, int], MotionComparison] = {}
        self._tracking_tasks: dict[str, str] = {}

    def pose_model(self) -> str | None:
        connection = self.services.models.connection("pose")
        return connection.model if connection else None

    def clip(self, project_id: str) -> MotionClip:
        self.services.store.state(project_id)
        clip = self.services.clips.latest(project_id)
        if clip is None:
            raise NoClip("Bring a reference video first")
        return clip

    def add_video(self, project_id: str, upload: MotionVideoUpload) -> MotionClip:
        state = self.services.store.state(project_id)
        target = state.project.bodies[0].id if state.project.bodies else None
        return self.services.clips.add(project_id, upload, target)

    def choose(self, project_id: str, choice: MotionChoice) -> MotionClip:
        """Change who to copy, onto which body or how the video sees them; a new person needs tracking again."""
        clip = self.clip(project_id)
        bodies = {body.id for body in self.services.store.state(project_id).project.bodies}
        if choice.target is not None and choice.target not in bodies:
            raise UnknownClip(f"There is no body {choice.target!r}")
        changes: dict[str, object] = {key: value for key, value in choice.model_dump().items() if value is not None}
        if choice.person is not None and choice.person != clip.person:
            changes["frames"] = []
        updated = clip.model_copy(update=changes)
        self.services.clips.save(project_id, updated)
        return updated

    def track(self, project_id: str) -> MotionTracking:
        """Start tracking the clip with the pose model as a background task."""
        clip = self.clip(project_id)
        client = capability_client(self.services.models, "pose")
        if client is None:
            raise NoPoseModel(NO_POSE_MODEL)
        current = self.board.get(clip.id)
        if current is not None and current.state == "running":
            raise TrackingBusy("This clip is being tracked already")
        status = self.board.set(
            MotionTracking(
                clip=clip.id, state="running", frame=0, frames=clip.video.frames, model=client.connection.model
            )
        )

        def work(context: TaskContext) -> None:
            try:
                track_clip(self.services.clips, self.board, client, project_id, clip, context.token.check)
            except Exception as error:
                stopped = context.token.cancelled
                self.board.update(clip.id, state="stopped" if stopped else "failed", message=str(error) or None)
                raise

        task = self.services.tasks.start("pose_tracking", f"Track the motion in {clip.video.name}", work, project_id)
        with self._lock:
            self._tracking_tasks[clip.id] = task.id
        return status

    def cancel_tracking(self, project_id: str) -> MotionTracking | None:
        clip = self.clip(project_id)
        with self._lock:
            task_id = self._tracking_tasks.get(clip.id)
        if task_id is not None:
            self.services.tasks.cancel(task_id)
        return self.board.get(clip.id)

    def comparison(self, project_id: str, clip_id: str) -> MotionComparison | None:
        runs = imitation_runs(self.services.runs, project_id, clip_id)
        if not runs:
            return None
        rollout = latest_rollout(self.services.runs, runs[0].run_id)
        key = (runs[0].run_id, rollout.step if rollout else -1)
        with self._lock:
            cached = self._compared.get(key)
        if cached is not None:
            return cached
        found = compare(self.services.runs, project_id, clip_id)
        if found is not None and found.run_id == key[0] and found.step == key[1]:
            with self._lock:
                self._compared[key] = found
        return found

    def workspace(self, project_id: str) -> MotionWorkspace:
        state = self.services.store.state(project_id)
        clip = self.services.clips.latest(project_id)
        tracking = self.board.get(clip.id) if clip else None
        runs = imitation_runs(self.services.runs, project_id, clip.id) if clip else []
        return MotionWorkspace(
            clip=clip,
            tracking=tracking,
            pose_model=self.pose_model(),
            reference=state.project.task.motion,
            comparison=self.comparison(project_id, clip.id) if clip else None,
            run_id=runs[0].run_id if runs else None,
        )

    def train(self, project_id: str, request: MotionTrain) -> RunStatus:
        """Make the project imitate its tracked clip, in one revision, and start training it."""
        clip = self.clip(project_id)
        project = self.services.store.state(project_id).project
        focus = None
        previous = imitation_runs(self.services.runs, project_id, clip.id)
        if request.focus == "weakest":
            compared = self.comparison(project_id, clip.id)
            if compared is not None and clip.frames:
                share = FOCUS_SECONDS * clip.video.fps / len(clip.frames)
                focus = (compared.weakest, min(1.0, compared.weakest + share))
        reference = build_reference(project, clip, focus)
        operations = imitation_operations(project, reference)
        if operations:
            summary = f"Imitate {clip.video.name}"[:200]
            self.services.store.apply(project_id, OperationBatch(operations=operations, summary=summary))
        state = self.services.store.state(project_id)
        warm = None
        if request.warm and previous:
            folder = self.services.runs.folder(previous[0].run_id)
            status = folder.status()
            step = status.best_step if status.best_step is not None else status.step
            if any(point.step == step for point in folder.checkpoints()):
                warm = WarmStart(run_id=status.run_id, step=step)
        brain = state.project.brain
        steps = request.total_steps or brain.training_steps or RECOMMENDED_STEPS["imitation"]
        start = StartRun(total_steps=steps, copies=request.copies or brain.copies, warm_start=warm)
        settings = self.services.training.get()
        return self.services.supervisor.start(state, start, settings.threads, settings.use_graphics_card)

    def export(self, project_id: str, request: MotionExportRequest) -> MotionExportFile:
        clip = self.clip(project_id)
        if request.source == "reference":
            if not clip.frames:
                raise NoClip("Track the motion first: the clip has no pose yet")
            mirror = facing(clip)
            segments = list(SEGMENTS)
            rows = [[segment_angle(frame, segment, clip, mirror) for segment in segments] for frame in clip.frames]
            return export_motion(clip.video.name, request, segments, rows, clip.video.fps, clip.view)
        compared = self.comparison(project_id, clip.id)
        if compared is None:
            raise NoClip("Train the copy first: there is no physics result to export yet")
        roots = self._roots(compared)
        return export_motion(
            clip.video.name,
            request,
            compared.segments,
            compared.result,
            compared.fps,
            clip.view,
            roots,
            compared.match,
        )

    def _roots(self, compared: MotionComparison) -> list[tuple[float, float]]:
        """The body's root in the picture's plane at each reference frame, from the start, in metres."""
        rollout = latest_rollout(self.services.runs, compared.run_id)
        project = self.services.runs.folder(compared.run_id).project()
        root = (
            next((obj.id for obj in project.bodies[0].objects if obj.parent is None), None) if project.bodies else None
        )
        if rollout is None or root is None or root not in rollout.geoms or not rollout.frames:
            return []
        column = rollout.geoms.index(root)
        across = 0 if project.task.motion is None or project.task.motion.view == "side" else 1
        times = np.array([frame.time for frame in rollout.frames])
        origin = rollout.frames[0].positions[column]
        roots: list[tuple[float, float]] = []
        for index in range(len(compared.match)):
            frame = rollout.frames[int(np.argmin(np.abs(times - index / compared.fps)))]
            position = frame.positions[column]
            roots.append((round(position[across] - origin[across], 4), round(position[2], 4)))
        return roots
