import secrets
import shutil
from datetime import UTC, datetime
from pathlib import Path

from icarus.contracts.project import ProjectState
from icarus.contracts.training import RunStatus
from icarus.projects.files import write_atomic
from icarus.training.run_store import TERMINAL_STATES, RunFolder, RunStore
from icarus.training.supervisor import RunInProgress

# Files of the source run's own life (live state, process, coach conversation); status is written last on a copy.
_RUN_ONLY = ("status.json", "live.json", "worker.pid", "stop.request", "console.txt", "diagnosis")
_RECORD = ("run.json", "project.json")


def _new_folder(runs: RunStore) -> RunFolder:
    runs.root.mkdir(parents=True, exist_ok=True)
    while True:
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        path = runs.root / f"run-{stamp}-{secrets.token_hex(2)}"
        try:
            path.mkdir()
        except FileExistsError:
            continue
        return RunFolder(path)


def _copy_files(source: RunFolder, target: Path, status: RunStatus, include_brains: bool, include_runs: bool) -> None:
    if include_runs:
        skipped = _RUN_ONLY if include_brains else (*_RUN_ONLY, "checkpoints")
        shutil.copytree(
            source.path, target, ignore=lambda _, names: [n for n in names if n in skipped], dirs_exist_ok=True
        )
    else:
        for name in _RECORD:
            shutil.copy2(source.path / name, target / name)
        if status.best_step:
            best = source.checkpoint_path(status.best_step)
            (target / "checkpoints").mkdir(exist_ok=True)
            shutil.copy2(best, target / "checkpoints" / best.name)
    for child in ("checkpoints", "rollouts"):
        (target / child).mkdir(exist_ok=True)


def _carries_brain(folder: RunFolder, status: RunStatus) -> bool:
    return bool(status.best_step) and folder.checkpoint_path(status.best_step or 0).is_file()


def duplicate_runs(
    runs: RunStore, from_project: ProjectState, to_project: ProjectState, include_brains: bool, include_runs: bool
) -> list[RunStatus]:
    """Copy the ended runs of the source's current revision onto the duplicate's current revision.

    Only that revision is copied: the duplicate starts from it, and older revision numbers would collide with the
    duplicate's own future revisions. Without runs, only runs holding a trained brain are copied, brain alone.
    """
    if not (include_brains or include_runs):
        return []
    copies: list[RunStatus] = []
    revision = from_project.revision.number
    for status in reversed(runs.list_runs(from_project.project.id)):
        if status.revision_number != revision or status.state not in TERMINAL_STATES:
            continue
        source = runs.folder(status.run_id)
        if not include_runs and not _carries_brain(source, status):
            continue
        target = _new_folder(runs)
        _copy_files(source, target.path, status, include_brains, include_runs)
        owner = to_project.project
        renumbered = {"run_id": target.run_id, "project_id": owner.id, "revision_number": to_project.revision.number}
        write_atomic(target.path / "run.json", source.config().model_copy(update=renumbered).model_dump_json(indent=2))
        project = source.project().model_copy(update={"id": owner.id, "name": owner.name})
        write_atomic(target.path / "project.json", project.model_dump_json(indent=2))
        copy = status.model_copy(update=renumbered)
        target.write_status(copy)
        copies.append(copy)
    return copies


def delete_runs(runs: RunStore, project_id: str) -> list[str]:
    """Remove every run of a project from disk, refusing while one of them is still training."""
    statuses = runs.list_runs(project_id)
    training = next((status for status in statuses if status.state not in TERMINAL_STATES), None)
    if training is not None:
        raise RunInProgress(training.run_id)
    for status in statuses:
        shutil.rmtree(runs.folder(status.run_id).path)
    return [status.run_id for status in statuses]
