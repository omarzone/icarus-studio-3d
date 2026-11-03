import os
import re
import secrets
import subprocess
import sys
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from importlib import metadata
from pathlib import Path

from pydantic import BaseModel, ConfigDict, ValidationError

from icarus.contracts.coach import Diagnosis
from icarus.contracts.project import Project, ProjectState
from icarus.contracts.training import (
    CheckpointInfo,
    LogLine,
    MetricPoint,
    Rollout,
    RunConfig,
    RunGroup,
    RunState,
    RunStatus,
    StartRun,
    TrainingSnapshot,
)
from icarus.library.look_properties import training_content
from icarus.projects.files import append_line, write_atomic
from icarus.training.episodes import CheckpointEpisodes
from icarus.training.schedule import checkpoint_steps

ENGINE_ROOT = Path(__file__).resolve().parents[3]
# Where runs lived before they moved next to the projects; the engine moves them out of it on start.
LEGACY_RUNS_DIR = ENGINE_ROOT / "runs"
RUN_ID = re.compile(r"^run-\d{8}T\d{6}Z-[0-9a-f]{4}$")
GROUP_ID = re.compile(r"^group-\d{8}T\d{6}Z-[0-9a-f]{4}$")
FRAME_NAME = re.compile(r"^e\d-(start|middle|failure|end|sheet)\.png$")
TERMINAL_STATES: frozenset[RunState] = frozenset({"done", "stopped", "failed"})
EVALUATION_EPISODES = 20
TRACKED_PACKAGES = ("icarus-engine", "mujoco", "gymnasium", "stable-baselines3", "torch")
# Windows refuses to replace or open a file another process holds for a moment, so file access retries briefly.
_RETRIES = 20
_RETRY_PAUSE = 0.01


class UnknownRun(LookupError):
    pass


class UnknownGroup(UnknownRun):
    pass


@dataclass(frozen=True)
class GroupMember:
    """One agent's run in a group: the one-agent project it trains with, frozen in place of the whole project."""

    project: Project
    agent: str
    agent_name: str
    group: str
    name: str


class RunMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    versions: dict[str, str | None]
    git_revision: str | None
    python: str
    created_at: datetime


def _version(package: str) -> str | None:
    try:
        return metadata.version(package)
    except metadata.PackageNotFoundError:
        return None


def _git_revision() -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=ENGINE_ROOT,
            capture_output=True,
            text=True,
            timeout=5,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    return result.stdout.strip() or None


def _retrying[T](action: Callable[[], T]) -> T:
    for _ in range(_RETRIES - 1):
        try:
            return action()
        except PermissionError:
            time.sleep(_RETRY_PAUSE)
    return action()


def _write(path: Path, text: str) -> None:
    _retrying(lambda: write_atomic(path, text))


def _write_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(f"{path.name}.{secrets.token_hex(4)}.tmp")
    partial.write_bytes(data)
    try:
        _retrying(lambda: os.replace(partial, path))
    except OSError:
        partial.unlink(missing_ok=True)
        raise


def _read(path: Path) -> str:
    return _retrying(lambda: path.read_text(encoding="utf-8"))


def _complete_lines(path: Path) -> list[str]:
    """Lines of an append-only file, leaving out a last line the writer has not finished."""
    if not path.is_file():
        return []
    return [line for line in _read(path).split("\n")[:-1] if line.strip()]


def _records[M: BaseModel](path: Path, model: type[M]) -> list[M]:
    """Parsed lines of an append-only file, skipping a line a killed writer cut off."""
    records: list[M] = []
    for line in _complete_lines(path):
        try:
            records.append(model.model_validate_json(line))
        except ValidationError:
            continue
    return records


class RunFolder:
    """One run's directory: everything the worker writes and the API reads."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.run_id = path.name

    def config(self) -> RunConfig:
        return RunConfig.model_validate_json(_read(self.path / "run.json"))

    def project(self) -> Project:
        return Project.model_validate_json(_read(self.path / "project.json"))

    def stored_status(self) -> RunStatus:
        return RunStatus.model_validate_json(_read(self.path / "status.json"))

    def status(self) -> RunStatus:
        status = self.stored_status()
        if status.state in ("starting", "running") and self.stop_requested():
            return status.model_copy(update={"state": "stopping"})
        if status.state in ("starting", "running") and self.pause_requested():
            return status.model_copy(update={"paused": True})
        return status

    def write_status(self, status: RunStatus) -> None:
        _write(self.path / "status.json", status.model_dump_json())

    def append_metric(self, point: MetricPoint) -> None:
        append_line(self.path / "metrics.jsonl", point.model_dump_json())

    def metrics(self) -> list[MetricPoint]:
        return _records(self.path / "metrics.jsonl", MetricPoint)

    def checkpoint_path(self, step: int) -> Path:
        return self.path / "checkpoints" / f"{step}.zip"

    def rollout_path(self, step: int) -> Path:
        return self.path / "rollouts" / f"{step}.json"

    def checkpoints(self) -> list[CheckpointInfo]:
        return [self.checkpoint_of(point) for point in self.metrics() if point.kind == "eval"]

    def checkpoint_of(self, evaluation: MetricPoint) -> CheckpointInfo:
        return CheckpointInfo(
            step=evaluation.step,
            episode_return=evaluation.episode_return,
            success_rate=evaluation.success_rate,
            failure_rate=evaluation.failure_rate,
            has_rollout=self.rollout_path(evaluation.step).is_file(),
        )

    def write_rollout(self, rollout: Rollout) -> None:
        _write(self.rollout_path(rollout.step), rollout.model_dump_json())

    def rollout(self, step: int) -> Rollout | None:
        path = self.rollout_path(step)
        return Rollout.model_validate_json(_read(path)) if path.is_file() else None

    def frames_folder(self, step: int) -> Path:
        return self.path / "frames" / str(step)

    def frame_path(self, step: int, name: str) -> Path:
        if not FRAME_NAME.fullmatch(name):
            raise ValueError(f"{name!r} is not a frame name")
        return self.frames_folder(step) / name

    def write_frame(self, step: int, name: str, png: bytes) -> None:
        path = self.frame_path(step, name)
        _write_bytes(path, png)

    def write_episodes(self, episodes: CheckpointEpisodes) -> None:
        _write(self.frames_folder(episodes.step) / "episodes.json", episodes.model_dump_json())

    def episodes(self, step: int) -> CheckpointEpisodes | None:
        path = self.frames_folder(step) / "episodes.json"
        return CheckpointEpisodes.model_validate_json(_read(path)) if path.is_file() else None

    def diagnoses(self) -> list[Diagnosis]:
        """Every diagnosis of the run, oldest first, from diagnosis/<n>.json."""
        folder = self.path / "diagnosis"
        paths = sorted(folder.glob("*.json"), key=lambda path: int(path.stem)) if folder.is_dir() else []
        return [Diagnosis.model_validate_json(_read(path)) for path in paths if path.stem.isdigit()]

    def add_diagnosis(self, diagnosis: Diagnosis) -> int:
        """Store a diagnosis as the next diagnosis/<n>.json and return n, counting from 1."""
        number = len(self.diagnoses()) + 1
        _write(self.path / "diagnosis" / f"{number}.json", diagnosis.model_dump_json(indent=2))
        return number

    def write_snapshot(self, snapshot: TrainingSnapshot) -> None:
        # Empty rays and absent fields are left out: the file is rewritten several times a second.
        _write(self.path / "live.json", snapshot.model_dump_json(exclude_defaults=True))

    def snapshot_version(self) -> tuple[int, int, int] | None:
        """Which live.json is there now (each write replaces the file), so a reader skips one it already has."""
        try:
            stat = (self.path / "live.json").stat()
        except OSError:
            return None
        return (stat.st_ino, stat.st_mtime_ns, stat.st_size)

    def snapshot(self) -> TrainingSnapshot | None:
        path = self.path / "live.json"
        return TrainingSnapshot.model_validate_json(_read(path)) if path.is_file() else None

    def append_log(self, line: LogLine) -> None:
        append_line(self.path / "worker.log", line.model_dump_json())

    def log(self) -> list[LogLine]:
        return _records(self.path / "worker.log", LogLine)

    def request_stop(self) -> None:
        (self.path / "stop.request").touch()

    def stop_requested(self) -> bool:
        return (self.path / "stop.request").is_file()

    def request_pause(self) -> None:
        (self.path / "pause.request").touch()

    def clear_pause(self) -> None:
        (self.path / "pause.request").unlink(missing_ok=True)

    def pause_requested(self) -> bool:
        return (self.path / "pause.request").is_file()

    def write_worker_pid(self, pid: int) -> None:
        _write(self.path / "worker.pid", str(pid))

    def worker_pid(self) -> int | None:
        path = self.path / "worker.pid"
        text = _read(path).strip() if path.is_file() else ""
        return int(text) if text.isdigit() else None

    @property
    def console_path(self) -> Path:
        """Raw output of the worker process, kept for failures the worker could not report itself."""
        return self.path / "console.txt"


class RunStore:
    """Training runs on disk, one self-contained directory per run."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self._create_lock = threading.Lock()

    def folder(self, run_id: str) -> RunFolder:
        if not RUN_ID.fullmatch(run_id) or not (self.root / run_id / "status.json").is_file():
            raise UnknownRun(run_id)
        return RunFolder(self.root / run_id)

    def _folders(self) -> list[RunFolder]:
        if not self.root.is_dir():
            return []
        return [
            RunFolder(path)
            for path in self.root.iterdir()
            if RUN_ID.fullmatch(path.name) and (path / "status.json").is_file()
        ]

    def list_runs(self, project_id: str) -> list[RunStatus]:
        statuses = [folder.status() for folder in self._folders()]
        mine = [status for status in statuses if status.project_id == project_id]
        return sorted(mine, key=lambda status: (status.started_at, status.run_id), reverse=True)

    def all_runs(self) -> list[RunStatus]:
        return [folder.status() for folder in self._folders()]

    def new_group_id(self) -> str:
        return f"group-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}-{secrets.token_hex(2)}"

    def next_run_name(self, project_id: str) -> str:
        """The next run's name in the project; the runs of a group of agents count as one."""
        starts = {status.group or status.run_id for status in self.list_runs(project_id)}
        return f"Run {len(starts) + 1}"

    def group(self, group_id: str) -> RunGroup:
        """A group's runs in the order they started, which is the agents' order."""
        if not GROUP_ID.fullmatch(group_id):
            raise UnknownGroup(group_id)
        runs = sorted(
            (status for status in self.all_runs() if status.group == group_id),
            key=lambda status: (status.started_at, status.run_id),
        )
        if not runs:
            raise UnknownGroup(group_id)
        return RunGroup(
            group_id=group_id, project_id=runs[0].project_id, revision_number=runs[0].revision_number, runs=runs
        )

    def create(
        self,
        state: ProjectState,
        start: StartRun,
        threads: int,
        evaluation_episodes: int = EVALUATION_EPISODES,
        member: GroupMember | None = None,
    ) -> RunStatus:
        project = member.project if member is not None else state.project
        with self._create_lock:
            now = datetime.now(UTC)
            run_id = f"run-{now.strftime('%Y%m%dT%H%M%SZ')}-{secrets.token_hex(2)}"
            while (self.root / run_id).exists():
                run_id = f"run-{now.strftime('%Y%m%dT%H%M%SZ')}-{secrets.token_hex(2)}"
            folder = RunFolder(self.root / run_id)
            folder.path.mkdir(parents=True)
            for child in ("checkpoints", "rollouts"):
                (folder.path / child).mkdir()
            config = RunConfig(
                run_id=run_id,
                project_id=project.id,
                revision_number=state.revision.number,
                seed=project.brain.seed if start.seed is None else start.seed,
                total_steps=start.total_steps,
                copies=start.copies,
                # A warm-started run counts its own steps from 0: its checkpoint 0 is the inherited brain evaluated on
                # this revision, so the schedule and the step numbers mean the same in every run.
                checkpoint_steps=checkpoint_steps(start.total_steps),
                evaluation_episodes=evaluation_episodes,
                threads=threads,
                warm_start=start.warm_start,
                agent=member.agent if member else None,
                group=member.group if member else None,
            )
            meta = RunMeta(
                versions={package: _version(package) for package in TRACKED_PACKAGES},
                git_revision=_git_revision(),
                python=sys.version.split()[0],
                created_at=now,
            )
            _write(folder.path / "run.json", config.model_dump_json(indent=2))
            _write(folder.path / "project.json", project.model_dump_json(indent=2))
            _write(folder.path / "meta.json", meta.model_dump_json(indent=2))
            status = RunStatus(
                run_id=run_id,
                project_id=project.id,
                revision_number=state.revision.number,
                name=member.name if member else self.next_run_name(project.id),
                state="starting",
                step=0,
                total_steps=start.total_steps,
                copies=start.copies,
                steps_per_second=0.0,
                started_at=now,
                agent=member.agent if member else None,
                agent_name=member.agent_name if member else None,
                group=member.group if member else None,
            )
            folder.write_status(status)
            return status

    def _fits(self, revision: int, project: Project | None, agent: str | None) -> Callable[[RunStatus], bool]:
        """Runs of the revision, and with `project` also runs of revisions that differ from it only in looks; only the
        runs of `agent` in a project with several agents (`project` is then that agent's one-agent project)."""
        content = training_content(project) if project is not None else None

        def fits(status: RunStatus) -> bool:
            if status.agent != agent:
                return False
            if status.revision_number == revision:
                return True
            return content is not None and training_content(self.folder(status.run_id).project()) == content

        return fits

    def latest_ended(
        self, project_id: str, revision: int, project: Project | None = None, agent: str | None = None
    ) -> RunStatus | None:
        """The newest run of a revision that is no longer training."""
        fits = self._fits(revision, project, agent)
        return next(
            (status for status in self.list_runs(project_id) if status.state in TERMINAL_STATES and fits(status)),
            None,
        )

    def trained_checkpoint(
        self, project_id: str, revision: int, project: Project | None = None, agent: str | None = None
    ) -> tuple[RunStatus, Path] | None:
        """The best trained checkpoint of the newest ended run of a revision, the brain Play should use.

        Step 0 is the untrained network, so a run whose best is step 0 has no trained brain.
        """
        fits = self._fits(revision, project, agent)
        for status in self.list_runs(project_id):
            if status.state not in TERMINAL_STATES or not fits(status):
                continue
            if status.best_step:
                path = self.folder(status.run_id).checkpoint_path(status.best_step)
                if path.is_file():
                    return status, path
        return None
