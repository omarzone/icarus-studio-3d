import os
import secrets
import shutil
import threading
from collections.abc import Callable
from pathlib import Path

from icarus.contracts.storage import ChangeDataFolder, DataFolderCheck, DataFolderMove, StorageInfo
from icarus.storage.data_folder import PROJECTS, RUNS, data_folder, save_data_folder, set_by_environment
from icarus.storage.relocation import Relocation, movable_entries, relocate, unreadable_run
from icarus.training.run_store import ENGINE_ROOT

# The checkout or install the engine runs from; a reinstall would delete data kept inside it.
APP_ROOT = ENGINE_ROOT.parent.parent


class MoveRefused(Exception):
    """The data folder cannot change now or to that folder, with a sentence a person can read."""

    def __init__(self, message: str, conflict: bool = False) -> None:
        super().__init__(message)
        self.conflict = conflict


def folder_bytes(folder: Path) -> int:
    total = 0
    for root, _dirs, files in os.walk(folder):
        for name in files:
            try:
                total += (Path(root) / name).stat().st_size
            except OSError:
                continue
    return total


def _existing(folder: Path) -> Path:
    for candidate in (folder, *folder.parents):
        if candidate.exists():
            return candidate
    return folder


def free_bytes(folder: Path) -> int:
    try:
        return shutil.disk_usage(_existing(folder)).free
    except OSError:
        return 0


def _inside(path: Path, parent: Path) -> bool:
    return path == parent or parent in path.parents


def _same_drive(first: Path, second: Path) -> bool:
    try:
        return _existing(first).stat().st_dev == _existing(second).stat().st_dev
    except OSError:
        return False


def _writable(folder: Path) -> bool:
    probe = folder / f".icarus-write-check-{secrets.token_hex(4)}"
    try:
        probe.write_bytes(b"")
        probe.unlink()
    except OSError:
        return False
    return True


class DataFolderMover:
    """Shows where projects and runs live and moves them to a new data folder without losing any of them.

    Each project and run is copied, verified byte for byte and only then removed from the old folder. The new
    folder is saved once the move ends and the engine uses it after it starts again.
    """

    def __init__(
        self,
        projects_root: Path,
        runs_root: Path,
        busy: Callable[[], str | None],
        hold_training: Callable[[str | None], None],
        settings_root: Path | None = None,
        app_root: Path = APP_ROOT,
    ) -> None:
        self._projects, self._runs = projects_root, runs_root
        self._busy, self._hold = busy, hold_training
        self._settings_root = settings_root
        self._app_root = app_root
        self._lock = threading.Lock()
        self._move = DataFolderMove(state="idle")

    def status(self) -> DataFolderMove:
        with self._lock:
            return self._move

    def info(self) -> StorageInfo:
        return StorageInfo(
            data_folder=str(data_folder(self._settings_root)),
            projects_folder=str(self._projects),
            runs_folder=str(self._runs),
            projects_bytes=folder_bytes(self._projects),
            runs_bytes=folder_bytes(self._runs),
            free_bytes=free_bytes(self._projects),
            set_by_environment=set_by_environment(),
            move=self.status(),
        )

    def check(self, folder: str) -> DataFolderCheck:
        target = Path(folder)
        needed = folder_bytes(self._projects) + folder_bytes(self._runs)
        free = free_bytes(target) if target.is_absolute() else 0
        return DataFolderCheck(
            folder=folder, problem=self._problem(target, needed, free), needed_bytes=needed, free_bytes=free
        )

    def _problem(self, target: Path, needed: int, free: int) -> str | None:
        if set_by_environment():
            return "The data folder is set by ICARUS_PROJECTS_DIR or ICARUS_RUNS_DIR, so it cannot change here"
        if not target.is_absolute():
            return "Choose a folder with its full path"
        if not target.is_dir():
            return "This folder does not exist"
        resolved = target.resolve()
        current = data_folder(self._settings_root).resolve()
        if resolved == current:
            return "This is already the data folder"
        for inside in (current, self._projects.resolve(), self._runs.resolve()):
            if _inside(resolved, inside):
                return "The new folder cannot be inside the current data folder"
        if _inside(resolved, self._app_root.resolve()):
            return "The new folder cannot be inside the app's own folder, where an update would delete it"
        if not _writable(resolved):
            return "Icarus cannot write to this folder"
        if needed > free and not _same_drive(resolved, self._projects):
            return "That drive does not have enough free space for your projects and runs"
        return None

    def start(self, change: ChangeDataFolder) -> DataFolderMove:
        target = Path(change.folder)
        needed = folder_bytes(self._projects) + folder_bytes(self._runs) if change.move_data else 0
        free = free_bytes(target) if target.is_absolute() else 0
        problem = self._problem(target, needed, free)
        if problem is not None:
            raise MoveRefused(problem)
        target = target.resolve()
        with self._lock:
            if self._move.state == "moving":
                raise MoveRefused("The data folder is already moving", conflict=True)
            previous, self._move = self._move, DataFolderMove(state="moving", folder=str(target), text="Getting ready")
        # Held before asking, so no run can start between the question and the move.
        self._hold("Icarus is moving its data folder. Train again once it is done.")
        reason = self._busy()
        if reason is not None:
            self._hold(None)
            with self._lock:
                self._move = previous
            raise MoveRefused(reason, conflict=True)
        threading.Thread(
            target=self._run, args=(target, change.move_data), name="data-folder-move", daemon=True
        ).start()
        return self.status()

    def _report(self, **values: object) -> None:
        with self._lock:
            self._move = self._move.model_copy(update=values)

    def _run(self, target: Path, move_data: bool) -> None:
        try:
            lines = self._relocate(target) if move_data else []
            save_data_folder(target, self._settings_root)
            lines.append(f"Icarus now keeps projects and runs in {target}")
            self._report(state="done", progress=1.0, text="Done", lines=lines, restart_needed=True)
        except OSError as error:
            self._report(state="failed", text=f"The data folder did not change: {error}")
        finally:
            self._hold(None)

    def _relocate(self, target: Path) -> list[str]:
        moves = (
            (self._projects, target / PROJECTS, None, "projects"),
            (self._runs, target / RUNS, unreadable_run, "run files"),
        )
        total = sum(len(movable_entries(source)) for source, *_ in moves) or 1
        done = 0

        def step(entry: Path) -> None:
            nonlocal done
            self._report(progress=done / total, text=f"Moving {entry.name}")
            done += 1

        lines: list[str] = []
        for source, destination, check, noun in moves:
            result: Relocation = relocate(source, destination, check=check, on_entry=step)
            lines += result.lines(source, destination, noun)
        return lines
