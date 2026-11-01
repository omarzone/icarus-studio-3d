import os
import re
import secrets
import subprocess
import sys
import threading
import time
from collections.abc import Callable
from datetime import UTC, datetime
from importlib import metadata
from pathlib import Path

from pydantic import BaseModel, ConfigDict, ValidationError

from icarus.contracts.project import Project, ProjectState
from icarus.contracts.training import (
    CheckpointInfo,
    LogLine,
    MetricPoint,
    Rollout,
    RunConfig,
    RunState,
    RunStatus,
    StartRun,
    TrainingSnapshot,
)
from icarus.projects.files import append_line, write_atomic
from icarus.training.schedule import checkpoint_steps

RUNS_DIR_ENV = "ICARUS_RUNS_DIR"
ENGINE_ROOT = Path(__file__).resolve().parents[3]
RUN_ID = re.compile(r"^run-\d{8}T\d{6}Z-[0-9a-f]{4}$")
TERMINAL_STATES: frozenset[RunState] = frozenset({"done", "stopped", "failed"})
EVALUATION_EPISODES = 20
TRACKED_PACKAGES = ("icarus-engine", "mujoco", "gymnasium", "stable-baselines3", "torch")
# Windows refuses to replace or open a file another process holds for a moment, so file access retries briefly.
_RETRIES = 20
_RETRY_PAUSE = 0.01


class UnknownRun(LookupError):
    pass


class RunMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    versions: dict[str, str | None]
    git_revision: str | None
    python: str
    created_at: datetime


def runs_dir() -> Path:
    configured = os.environ.get(RUNS_DIR_ENV)
    return Path(configured) if configured else ENGINE_ROOT / "runs"


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

    def write_snapshot(self, snapshot: TrainingSnapshot) -> None:
        _write(self.path / "live.json", snapshot.model_dump_json())

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

    def create(
        self, state: ProjectState, start: StartRun, threads: int, evaluation_episodes: int = EVALUATION_EPISODES
    ) -> RunStatus:
        project = state.project
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
                checkpoint_steps=checkpoint_steps(start.total_steps),
                evaluation_episodes=evaluation_episodes,
                threads=threads,
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
                name=f"Run {len(self.list_runs(project.id)) + 1}",
                state="starting",
                step=0,
                total_steps=start.total_steps,
                copies=start.copies,
                steps_per_second=0.0,
                started_at=now,
            )
            folder.write_status(status)
            return status

    def latest_ended(self, project_id: str, revision: int) -> RunStatus | None:
        """The newest run of a revision that is no longer training."""
        return next(
            (
                status
                for status in self.list_runs(project_id)
                if status.revision_number == revision and status.state in TERMINAL_STATES
            ),
            None,
        )

    def trained_checkpoint(self, project_id: str, revision: int) -> tuple[RunStatus, Path] | None:
        """The best trained checkpoint of the newest ended run of a revision, the brain Play should use.

        Step 0 is the untrained network, so a run whose best is step 0 has no trained brain.
        """
        for status in self.list_runs(project_id):
            if status.revision_number != revision or status.state not in TERMINAL_STATES:
                continue
            if status.best_step:
                path = self.folder(status.run_id).checkpoint_path(status.best_step)
                if path.is_file():
                    return status, path
        return None
