import filecmp
import os
import secrets
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from shutil import copytree

from pydantic import ValidationError

from icarus.contracts.training import RunStatus
from icarus.training.run_store import RUN_ID


@dataclass
class Relocation:
    """What moving runs from an old folder did, one readable line per run that did not simply move."""

    moved: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)

    def lines(self, source: Path, target: Path) -> list[str]:
        head = [f"Moved {len(self.moved)} training runs from {source} to {target}"] if self.moved else []
        return head + self.skipped


def _same_tree(source: Path, copy: Path) -> bool:
    """Whether every file under source exists under copy with the same bytes, and nothing else does."""
    originals = sorted(path.relative_to(source) for path in source.rglob("*") if path.is_file())
    copies = sorted(path.relative_to(copy) for path in copy.rglob("*") if path.is_file())
    if originals != copies:
        return False
    return all(filecmp.cmp(source / name, copy / name, shallow=False) for name in originals)


def _move_one(run: Path, target: Path) -> str | None:
    """Copy one run next to its destination, verify it, put it in place and remove the original; a reason if not."""
    try:
        RunStatus.model_validate_json((run / "status.json").read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, ValidationError):
        return f"Left {run.name} in place: its status cannot be read"
    partial = target / f".{run.name}.{secrets.token_hex(4)}.partial"
    try:
        copytree(run, partial)
        if not _same_tree(run, partial):
            shutil.rmtree(partial, ignore_errors=True)
            return f"Left {run.name} in place: the copy did not match the original"
        os.replace(partial, target / run.name)
    except OSError as error:
        shutil.rmtree(partial, ignore_errors=True)
        return f"Left {run.name} in place: {error}"
    try:
        shutil.rmtree(run)
    except OSError as error:
        return f"Copied {run.name}, but the original could not be removed: {error}"
    return None


def relocate_runs(source: Path, target: Path) -> Relocation:
    """Move every run in source that target does not have yet; a run is removed from source only once its copy
    in target is verified, so nothing is lost when a step fails."""
    result = Relocation()
    if not source.is_dir() or (target.exists() and source.resolve() == target.resolve()):
        return result
    target.mkdir(parents=True, exist_ok=True)
    for run in sorted(source.iterdir()):
        if not run.is_dir() or not RUN_ID.fullmatch(run.name) or (target / run.name).exists():
            continue
        problem = _move_one(run, target)
        if problem is None:
            result.moved.append(run.name)
        else:
            result.skipped.append(problem)
    return result
