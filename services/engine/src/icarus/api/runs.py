import asyncio
import time
from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from icarus.contracts.scene import SceneDescription
from icarus.contracts.training import (
    CheckpointEvent,
    CheckpointInfo,
    LogEvent,
    MetricEvent,
    MetricPoint,
    Rollout,
    RunEvent,
    RunEventEnvelope,
    RunGroup,
    RunStatus,
    SnapshotEvent,
    StartRun,
    StatusEvent,
    TrainingSettings,
    TrainingSettingsPatch,
)
from icarus.design.compiler import compile_project
from icarus.design.scene import scene_description
from icarus.projects.store import ProjectStore
from icarus.training.run_comparison import RunComparison, compare_runs
from icarus.training.run_store import TERMINAL_STATES, RunFolder, RunStore
from icarus.training.settings import TrainingSettingsStore
from icarus.training.supervisor import Supervisor

router = APIRouter()

POLL_PERIOD = 0.25
# Live snapshots carry the frames since the previous one, so each must reach the view: check for one this often.
SNAPSHOT_POLL_PERIOD = 0.05
KEEPALIVE_PERIOD = 15.0


def _runs(request: Request) -> RunStore:
    return request.app.state.runs


def _supervisor(request: Request) -> Supervisor:
    return request.app.state.supervisor


def _settings(request: Request) -> TrainingSettingsStore:
    return request.app.state.training_settings


def _projects(request: Request) -> ProjectStore:
    return request.app.state.store


@router.post("/projects/{project_id}/runs", status_code=201)
def start_run(request: Request, project_id: str, body: StartRun) -> RunStatus:
    state = _projects(request).state(project_id)
    settings = _settings(request).get()
    return _supervisor(request).start(state, body, settings.threads, settings.use_graphics_card)


@router.post("/projects/{project_id}/run-groups", status_code=201)
def start_run_group(request: Request, project_id: str, body: StartRun) -> RunGroup:
    """Train every agent of a project with several at once, one run each, sharing the copies and threads."""
    state = _projects(request).state(project_id)
    settings = _settings(request).get()
    return _supervisor(request).start_group(state, body, settings.threads, settings.use_graphics_card)


@router.get("/run-groups/{group_id}")
def get_run_group(request: Request, group_id: str) -> RunGroup:
    return _runs(request).group(group_id)


@router.post("/run-groups/{group_id}/stop")
def stop_run_group(request: Request, group_id: str) -> RunGroup:
    return _supervisor(request).stop_group(group_id)


@router.get("/projects/{project_id}/runs")
def list_runs(request: Request, project_id: str) -> list[RunStatus]:
    _projects(request).state(project_id)
    return _runs(request).list_runs(project_id)


@router.get("/runs/compare")
def compare_two_runs(request: Request, a: str, b: str) -> RunComparison:
    """Two runs side by side (b minus a), with whether their evaluations used the same seeds."""
    return compare_runs(_runs(request), a, b)


@router.get("/runs/{run_id}")
def get_run(request: Request, run_id: str) -> RunStatus:
    return _runs(request).folder(run_id).status()


@router.post("/runs/{run_id}/stop")
def stop_run(request: Request, run_id: str) -> RunStatus:
    return _supervisor(request).stop(run_id)


@router.post("/runs/{run_id}/pause")
def pause_run(request: Request, run_id: str) -> RunStatus:
    """Hold the run between two training steps; its brain and copies wait in memory until it resumes."""
    return _supervisor(request).pause(run_id)


@router.post("/runs/{run_id}/resume")
def resume_run(request: Request, run_id: str) -> RunStatus:
    return _supervisor(request).resume(run_id)


@router.get("/runs/{run_id}/metrics")
def get_metrics(request: Request, run_id: str) -> list[MetricPoint]:
    return _runs(request).folder(run_id).metrics()


@router.get("/runs/{run_id}/checkpoints")
def get_checkpoints(request: Request, run_id: str) -> list[CheckpointInfo]:
    return _runs(request).folder(run_id).checkpoints()


@router.get("/runs/{run_id}/rollouts/{step}")
def get_rollout(request: Request, run_id: str, step: int) -> Rollout:
    rollout = _runs(request).folder(run_id).rollout(step)
    if rollout is None:
        raise HTTPException(status_code=404, detail=f"There is no rollout at step {step}")
    return rollout


@router.get("/runs/{run_id}/scene")
def get_run_scene(request: Request, run_id: str) -> SceneDescription:
    """The scene frozen with the run, so replays never draw against a project edited since."""
    folder = _runs(request).folder(run_id)
    return scene_description(compile_project(folder.project()), folder.config().revision_number)


class _EventCursor:
    """What one subscriber has been sent, so each poll only yields what is new."""

    def __init__(self, folder: RunFolder) -> None:
        self.folder = folder
        self.metrics = 0
        self.logs = 0
        self.status: RunStatus | None = None
        self.snapshot_version: tuple[int, int, int] | None = None
        self.finished = False

    def poll_snapshot(self) -> list[RunEvent]:
        """The live snapshot when the worker wrote a new one since the last poll."""
        version = self.folder.snapshot_version()
        if self.finished or version is None or version == self.snapshot_version:
            return []
        self.snapshot_version = version
        try:
            snapshot = self.folder.snapshot()
        except (OSError, ValueError):
            return []
        return [SnapshotEvent(type="snapshot", snapshot=snapshot)] if snapshot is not None else []

    def poll(self) -> tuple[list[RunEvent], bool]:
        folder = self.folder
        # Status first: everything written before a final status is then read below and sent ahead of it.
        status = folder.status()
        events: list[RunEvent] = []
        metrics = folder.metrics()
        for point in metrics[self.metrics :]:
            events.append(MetricEvent(type="metric", metric=point))
            if point.kind == "eval":
                events.append(CheckpointEvent(type="checkpoint", checkpoint=folder.checkpoint_of(point)))
        self.metrics = len(metrics)
        lines = folder.log()
        events += [LogEvent(type="log", line=line) for line in lines[self.logs :]]
        self.logs = len(lines)
        finished = status.state in TERMINAL_STATES
        events += self.poll_snapshot()
        self.finished = finished
        if status != self.status:
            events.append(StatusEvent(type="status", status=status))
            self.status = status
        return events, finished


async def _stream(cursor: _EventCursor) -> AsyncIterator[str]:
    quiet_since = time.monotonic()
    polled = 0.0
    while True:
        if time.monotonic() - polled >= POLL_PERIOD:
            polled = time.monotonic()
            events, finished = await asyncio.to_thread(cursor.poll)
        else:
            events, finished = await asyncio.to_thread(cursor.poll_snapshot), False
        for event in events:
            yield f"data: {RunEventEnvelope(event=event).model_dump_json()}\n\n"
        if finished:
            return
        now = time.monotonic()
        if events:
            quiet_since = now
        elif now - quiet_since >= KEEPALIVE_PERIOD:
            quiet_since = now
            yield ": keepalive\n\n"
        await asyncio.sleep(SNAPSHOT_POLL_PERIOD)


@router.get("/runs/{run_id}/events")
def run_events(request: Request, run_id: str) -> StreamingResponse:
    cursor = _EventCursor(_runs(request).folder(run_id))
    headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    return StreamingResponse(_stream(cursor), media_type="text/event-stream", headers=headers)


@router.get("/settings/training")
def get_training_settings(request: Request) -> TrainingSettings:
    return _settings(request).get()


@router.put("/settings/training")
def put_training_settings(request: Request, body: TrainingSettingsPatch) -> TrainingSettings:
    return _settings(request).update(body)
