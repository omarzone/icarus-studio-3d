import os
from pathlib import Path

from pydantic import BaseModel, ConfigDict, ValidationError

from icarus.copilot.settings import settings_dir
from icarus.projects.files import write_atomic

PROJECTS_DIR_ENV = "ICARUS_PROJECTS_DIR"
RUNS_DIR_ENV = "ICARUS_RUNS_DIR"
STORAGE_FILE = "storage.json"
PROJECTS = "projects"
RUNS = "runs"


class _Stored(BaseModel):
    model_config = ConfigDict(extra="forbid")

    data_folder: str


def default_data_folder() -> Path:
    return Path.home() / "Icarus Studio"


def data_folder(settings_root: Path | None = None) -> Path:
    """The folder holding projects and runs: the one chosen in the app, or the default in the home folder."""
    path = (settings_root or settings_dir()) / STORAGE_FILE
    try:
        stored = _Stored.model_validate_json(path.read_text(encoding="utf-8"))
    except (OSError, ValidationError):
        return default_data_folder()
    chosen = Path(stored.data_folder)
    return chosen if chosen.is_absolute() else default_data_folder()


def save_data_folder(folder: Path, settings_root: Path | None = None) -> None:
    write_atomic((settings_root or settings_dir()) / STORAGE_FILE, _Stored(data_folder=str(folder)).model_dump_json())


def set_by_environment() -> bool:
    return bool(os.environ.get(PROJECTS_DIR_ENV) or os.environ.get(RUNS_DIR_ENV))


def projects_dir() -> Path:
    configured = os.environ.get(PROJECTS_DIR_ENV)
    return Path(configured) if configured else data_folder() / PROJECTS


def runs_dir() -> Path:
    configured = os.environ.get(RUNS_DIR_ENV)
    return Path(configured) if configured else data_folder() / RUNS
