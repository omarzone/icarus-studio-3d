from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


MoveState = Literal["idle", "moving", "done", "failed"]


class DataFolderMove(_Model):
    """Where moving the data folder stands; lines say what moved and what was left where it was."""

    state: MoveState
    folder: str | None = None
    progress: float = Field(default=0, ge=0, le=1)
    text: str = ""
    lines: list[str] = []
    # True once the new folder is saved; the engine uses it after it starts again.
    restart_needed: bool = False


class StorageInfo(_Model):
    """The data folder holding projects and runs, the space they use and what is free on that drive."""

    data_folder: str
    projects_folder: str
    runs_folder: str
    projects_bytes: int = Field(ge=0)
    runs_bytes: int = Field(ge=0)
    free_bytes: int = Field(ge=0)
    # Set by ICARUS_PROJECTS_DIR or ICARUS_RUNS_DIR, which always win; it cannot be changed from the app then.
    set_by_environment: bool
    move: DataFolderMove


class DataFolderChoice(_Model):
    folder: str = Field(min_length=1, max_length=4096)


class DataFolderCheck(_Model):
    """Whether a folder can become the data folder, and why not in words."""

    folder: str
    problem: str | None
    # What moving the current projects and runs would copy, and what the new folder's drive has free.
    needed_bytes: int = Field(ge=0)
    free_bytes: int = Field(ge=0)


class ChangeDataFolder(_Model):
    folder: str = Field(min_length=1, max_length=4096)
    # Move the current projects and runs there; otherwise they stay where they are and the new folder starts empty.
    move_data: bool
