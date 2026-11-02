import threading
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from icarus.contracts.copilot import Conversation
from icarus.projects.files import write_atomic

FOLDER = ".copilot"


class ConversationStore:
    """Each project's conversation and proposals, kept beside the projects and never inside a project document."""

    def __init__(self, projects_root: Path) -> None:
        self._root = projects_root / FOLDER
        self._locks: dict[str, threading.Lock] = {}
        self._guard = threading.Lock()

    def _path(self, project_id: str) -> Path:
        return self._root / f"{project_id}.json"

    def _read(self, project_id: str) -> Conversation:
        path = self._path(project_id)
        if not path.is_file():
            return Conversation(project_id=project_id, messages=[], proposals=[], autonomy="ask", suggestions=[])
        return Conversation.model_validate_json(path.read_text(encoding="utf-8"))

    @contextmanager
    def editing(self, project_id: str) -> Iterator[Conversation]:
        """The conversation to change in place; it is saved when the block ends without an error."""
        with self._guard:
            lock = self._locks.setdefault(project_id, threading.Lock())
        with lock:
            conversation = self._read(project_id)
            before = conversation.model_dump_json()
            yield conversation
            if conversation.model_dump_json() != before:
                write_atomic(self._path(project_id), conversation.model_dump_json(indent=2))
