import filecmp
import os
import secrets
import shutil
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from shutil import copytree

from pydantic import ValidationError

from icarus.contracts.training import RunStatus
from icarus.training.run_store import RUN_ID

PARTIAL = ".partial"

# Why an entry must stay where it is, or None when it can move.
Check = Callable[[Path], str | None]


@dataclass
class Relocation:
    """What moving a folder's entries did, one readable line per entry that did not simply move."""

    moved: list[str] = field(default_factory=list)
    skipped: list[str] = field(default_factory=list)

    def lines(self, source: Path, target: Path, noun: str = "training runs") -> list[str]:
        head = [f"Moved {len(self.moved)} {noun} from {source} to {target}"] if self.moved else []
        return head + self.skipped


def _same_tree(source: Path, copy: Path) -> bool:
    """Whether every file under source exists under copy with the same bytes, and nothing else does."""
    originals = sorted(path.relative_to(source) for path in source.rglob("*") if path.is_file())
    copies = sorted(path.relative_to(copy) for path in copy.rglob("*") if path.is_file())
    if originals != copies:
        return False
    return all(filecmp.cmp(source / name, copy / name, shallow=False) for name in originals)


def _same(source: Path, copy: Path) -> bool:
    if source.is_dir():
        return copy.is_dir() and _same_tree(source, copy)
    return copy.is_file() and filecmp.cmp(source, copy, shallow=False)


def _discard(path: Path) -> None:
    if path.is_dir():
        shutil.rmtree(path, ignore_errors=True)
    else:
        path.unlink(missing_ok=True)


def _move_one(entry: Path, target: Path, check: Check | None) -> str | None:
    """Copy one entry next to its destination, verify it, put it in place and remove the original; a reason if not."""
    if check is not None and (problem := check(entry)):
        return f"Left {entry.name} in place: {problem}"
    partial = target / f".{entry.name}.{secrets.token_hex(4)}{PARTIAL}"
    try:
        if entry.is_dir():
            copytree(entry, partial)
        else:
            shutil.copy2(entry, partial)
        if not _same(entry, partial):
            _discard(partial)
            return f"Left {entry.name} in place: the copy did not match the original"
        os.replace(partial, target / entry.name)
    except OSError as error:
        _discard(partial)
        return f"Left {entry.name} in place: {error}"
    try:
        if entry.is_dir():
            shutil.rmtree(entry)
        else:
            entry.unlink()
    except OSError as error:
        return f"Copied {entry.name}, but the original could not be removed: {error}"
    return None


def movable_entries(source: Path, select: Callable[[Path], bool] | None = None) -> list[Path]:
    """The entries of source a move would carry, leaving out copies a stopped move left half done."""
    if not source.is_dir():
        return []
    return [
        entry
        for entry in sorted(source.iterdir())
        if not entry.name.endswith(PARTIAL) and (select is None or select(entry))
    ]


def relocate(
    source: Path,
    target: Path,
    select: Callable[[Path], bool] | None = None,
    check: Check | None = None,
    on_entry: Callable[[Path], None] | None = None,
    report_taken: bool = True,
) -> Relocation:
    """Move every entry of source that target does not have yet; an entry is removed from source only once its
    copy in target is verified, so nothing is lost when a step fails."""
    result = Relocation()
    if not source.is_dir() or (target.exists() and source.resolve() == target.resolve()):
        return result
    target.mkdir(parents=True, exist_ok=True)
    for entry in movable_entries(source, select):
        if on_entry is not None:
            on_entry(entry)
        if (target / entry.name).exists():
            if report_taken:
                result.skipped.append(f"Left {entry.name} in place: {target} already has one with that name")
            continue
        problem = _move_one(entry, target, check)
        if problem is None:
            result.moved.append(entry.name)
        else:
            result.skipped.append(problem)
    return result


def unreadable_run(entry: Path) -> str | None:
    """Why a run folder must not move: its status cannot be read. Other entries of a runs folder always move."""
    if not entry.is_dir() or not RUN_ID.fullmatch(entry.name):
        return None
    try:
        RunStatus.model_validate_json((entry / "status.json").read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, ValidationError):
        return "its status cannot be read"
    return None


def relocate_runs(source: Path, target: Path) -> Relocation:
    """Move the run folders of source into target, leaving everything else in source alone."""

    def is_run(entry: Path) -> bool:
        return entry.is_dir() and bool(RUN_ID.fullmatch(entry.name))

    # Runs the new folder already has were never this move's to make; they stay quietly in both.
    return relocate(source, target, select=is_run, check=unreadable_run, report_taken=False)
