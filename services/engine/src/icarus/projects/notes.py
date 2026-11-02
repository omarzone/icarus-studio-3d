from pathlib import Path

from icarus.projects.files import write_atomic
from icarus.projects.store import PROJECT_ID, UnknownProject

MAX_NOTES_LENGTH = 50_000
FOLDER = Path(".copilot") / "notes"


class NotesTooLong(ValueError):
    pass


class ProjectNotes:
    """The free-text Results notes of each project, kept beside the projects so the copilot can read them."""

    def __init__(self, projects_root: Path) -> None:
        self._root = projects_root / FOLDER

    def _path(self, project_id: str) -> Path:
        if not PROJECT_ID.fullmatch(project_id):
            raise UnknownProject(project_id)
        return self._root / f"{project_id}.md"

    def read(self, project_id: str) -> str:
        path = self._path(project_id)
        return path.read_text(encoding="utf-8") if path.is_file() else ""

    def write(self, project_id: str, text: str) -> None:
        path = self._path(project_id)
        if len(text) > MAX_NOTES_LENGTH:
            raise NotesTooLong(f"Notes are limited to {MAX_NOTES_LENGTH} characters")
        write_atomic(path, text)

    def delete(self, project_id: str) -> None:
        self._path(project_id).unlink(missing_ok=True)

    def for_copilot(self, project_id: str) -> str | None:
        """The notes as the copilot context should quote them, or None when the person wrote nothing."""
        text = self.read(project_id).strip()
        return text or None
