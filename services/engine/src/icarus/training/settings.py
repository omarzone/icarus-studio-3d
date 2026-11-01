import functools
import os
import shutil
import subprocess
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from icarus.contracts.training import TrainingSettings, TrainingSettingsPatch
from icarus.projects.files import write_atomic

SETTINGS_FILE = "training-settings.json"


class SettingsRejected(Exception):
    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


class _Stored(BaseModel):
    model_config = ConfigDict(extra="forbid")

    threads: int = Field(ge=1)
    use_graphics_card: bool


def max_threads() -> int:
    return os.cpu_count() or 1


@functools.cache
def graphics_card() -> str | None:
    """The first NVIDIA card, found without importing torch so the API stays light."""
    tool = shutil.which("nvidia-smi")
    if tool is None:
        return None
    try:
        result = subprocess.run(
            [tool, "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True,
            text=True,
            timeout=5,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.SubprocessError):
        return None
    names = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    return names[0] if result.returncode == 0 and names else None


class TrainingSettingsStore:
    """Threads and graphics card for training, kept in the runs folder so they travel with the runs."""

    def __init__(self, runs_root: Path, projects_root: Path) -> None:
        self.runs_root = runs_root
        self.projects_root = projects_root
        self._path = runs_root / SETTINGS_FILE

    def _stored(self) -> _Stored:
        default = _Stored(threads=max(1, max_threads() // 2), use_graphics_card=False)
        if not self._path.is_file():
            return default
        try:
            return _Stored.model_validate_json(self._path.read_text(encoding="utf-8"))
        except (OSError, ValidationError):
            return default

    def get(self) -> TrainingSettings:
        stored = self._stored()
        card = graphics_card()
        return TrainingSettings(
            threads=min(stored.threads, max_threads()),
            max_threads=max_threads(),
            use_graphics_card=stored.use_graphics_card and card is not None,
            graphics_card=card,
            projects_folder=str(self.projects_root),
            runs_folder=str(self.runs_root),
        )

    def update(self, patch: TrainingSettingsPatch) -> TrainingSettings:
        stored = self._stored()
        if patch.threads is not None:
            if patch.threads > max_threads():
                raise SettingsRejected("threads", f"This computer has {max_threads()} threads at most")
            stored.threads = patch.threads
        if patch.use_graphics_card is not None:
            if patch.use_graphics_card and graphics_card() is None:
                raise SettingsRejected("use_graphics_card", "No graphics card that can train was found")
            stored.use_graphics_card = patch.use_graphics_card
        write_atomic(self._path, stored.model_dump_json(indent=2))
        return self.get()
