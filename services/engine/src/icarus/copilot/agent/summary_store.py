from datetime import UTC, datetime
from pathlib import Path

from pydantic import BaseModel, ConfigDict, ValidationError

from icarus.projects.files import write_atomic
from icarus.projects.store import PROJECT_ID


class StoredSummary(BaseModel):
    """A rolling summary of a conversation's older messages; engine-internal, never sent to a frontend."""

    model_config = ConfigDict(extra="forbid")

    summary: str
    # The id of the newest message the summary covers.
    covers_until: str
    written_at: datetime


class SummaryStore:
    def __init__(self, folder: Path) -> None:
        # The conversations' folder, beside the projects and never inside a project document.
        self._root = folder

    def _path(self, project_id: str) -> Path | None:
        return self._root / f"{project_id}.summary.json" if PROJECT_ID.fullmatch(project_id) else None

    def read(self, project_id: str) -> StoredSummary | None:
        path = self._path(project_id)
        if path is None or not path.is_file():
            return None
        try:
            return StoredSummary.model_validate_json(path.read_text(encoding="utf-8"))
        except (OSError, ValidationError):
            return None

    def write(self, project_id: str, summary: str, covers_until: str) -> None:
        path = self._path(project_id)
        if path is None:
            return
        stored = StoredSummary(summary=summary, covers_until=covers_until, written_at=datetime.now(UTC))
        write_atomic(path, stored.model_dump_json(indent=2))

    def forget(self, project_id: str) -> None:
        path = self._path(project_id)
        if path is not None:
            path.unlink(missing_ok=True)
