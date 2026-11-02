import json
import threading

from icarus.contracts.coach import FailureGroup
from icarus.contracts.copilot import AttachmentInfo
from icarus.copilot.attachments import AttachmentStore, UnknownAttachment
from icarus.training.failure_groups import failure_groups
from icarus.training.run_store import RunFolder

PUBLISHED_FILE = "attachments.json"


class RunFrames:
    """Pictures the worker rendered of a run's episodes, published once as chat attachments so every screen and
    message reaches them the same way."""

    def __init__(self, attachments: AttachmentStore) -> None:
        self._attachments = attachments
        self._lock = threading.Lock()

    def publish(self, folder: RunFolder, step: int, names: list[str]) -> dict[str, AttachmentInfo]:
        """Attachments for the named pictures of a checkpoint, by name; pictures that were not rendered are left out."""
        project_id = folder.stored_status().project_id
        index = folder.frames_folder(step) / PUBLISHED_FILE
        with self._lock:
            known: dict[str, str] = json.loads(index.read_text(encoding="utf-8")) if index.is_file() else {}
            published: dict[str, AttachmentInfo] = {}
            for name in names:
                info = self._known(known.get(name))
                if info is None:
                    path = folder.frame_path(step, name)
                    if not path.is_file():
                        continue
                    info = self._attachments.add_bytes(project_id, name, "image/png", path.read_bytes(), "view")
                    known[name] = info.id
                published[name] = info
            index.parent.mkdir(parents=True, exist_ok=True)
            index.write_text(json.dumps(known), encoding="utf-8")
        return published

    def _known(self, attachment_id: str | None) -> AttachmentInfo | None:
        if attachment_id is None:
            return None
        try:
            return self._attachments.get(attachment_id).info
        except UnknownAttachment:
            return None

    def failure_groups(self, folder: RunFolder, step: int) -> list[FailureGroup]:
        """How a checkpoint's evaluation episodes ended, grouped, with their pictures as attachments."""
        episodes = folder.episodes(step)
        if episodes is None:
            return []
        groups = failure_groups(episodes)
        names = [name for group in groups for name in group.frames]
        published = self.publish(folder, step, names)
        return [
            FailureGroup(
                label=group.label,
                share=group.share,
                description=group.description,
                frame_attachment_ids=[published[name].id for name in group.frames if name in published],
            )
            for group in groups
        ]
