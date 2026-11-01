import base64
import binascii
import os
import re
import secrets
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path

from pydantic import BaseModel, ConfigDict

from icarus.contracts.copilot import AttachmentInfo, AttachmentKind, AttachmentUpload
from icarus.copilot.conversation_store import FOLDER
from icarus.projects.store import PROJECT_ID

MAX_BYTES = 15 * 1024 * 1024
ATTACHMENT_ID = re.compile(r"^([0-9a-f]{12})-([0-9a-f]{10})$")
DOCUMENT_TYPES = frozenset({"application/json", "application/pdf"})
# Raster formats a vision model reads, recognized by their first bytes rather than by the declared type.
_PICTURES = {
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"\xff\xd8\xff": "image/jpeg",
    b"GIF87a": "image/gif",
    b"GIF89a": "image/gif",
}
CONTENT_FILE = "content"
TEXT_FILE = "text.txt"
RECORD_FILE = "attachment.json"
FRAMES_FOLDER = "frames"


class UnknownAttachment(LookupError):
    pass


class AttachmentRejected(ValueError):
    """An upload that does not fit its kind, with a sentence a person can read."""


class _Record(BaseModel):
    model_config = ConfigDict(extra="forbid")

    info: AttachmentInfo
    # Media type of each stored frame, in order.
    frames: list[str]
    has_text: bool


@dataclass(frozen=True)
class Attachment:
    info: AttachmentInfo
    folder: Path
    frame_types: list[str]
    has_text: bool

    def content(self) -> bytes:
        return (self.folder / CONTENT_FILE).read_bytes()

    def text(self) -> str | None:
        return (self.folder / TEXT_FILE).read_text(encoding="utf-8") if self.has_text else None

    def frame(self, index: int) -> tuple[Path, str]:
        if not 0 <= index < len(self.frame_types):
            raise UnknownAttachment(f"{self.info.id}/frames/{index}")
        return self.folder / FRAMES_FOLDER / str(index), self.frame_types[index]


def picture_type(data: bytes) -> str | None:
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return next((media for magic, media in _PICTURES.items() if data.startswith(magic)), None)


def _decode(data: str, what: str) -> bytes:
    try:
        decoded = base64.b64decode("".join(data.split()), validate=True)
    except (binascii.Error, ValueError) as error:
        raise AttachmentRejected(f"{what} is not valid base64") from error
    if len(decoded) > MAX_BYTES:
        raise AttachmentRejected(f"{what} is larger than {MAX_BYTES // (1024 * 1024)} MB")
    return decoded


def _fits(kind: AttachmentKind, media_type: str) -> bool:
    match kind:
        case "image" | "view":
            return media_type.startswith("image/")
        case "video":
            return media_type.startswith("video/")
        case "document":
            return media_type.startswith("text/") or media_type in DOCUMENT_TYPES


def _document_text(upload: AttachmentUpload, media_type: str, content: bytes) -> str | None:
    if upload.text is not None:
        return upload.text
    if media_type.startswith("text/") or media_type == "application/json":
        return content.decode("utf-8", errors="replace")
    return None


class AttachmentStore:
    """Files added to the chat, kept beside the projects under ids the engine chooses."""

    def __init__(self, projects_root: Path) -> None:
        self._root = projects_root / FOLDER / "attachments"

    def add(self, project_id: str, upload: AttachmentUpload) -> AttachmentInfo:
        media_type = upload.media_type.split(";")[0].strip().lower()
        if not _fits(upload.kind, media_type):
            raise AttachmentRejected(f"A {upload.kind} cannot be a {media_type} file")
        if upload.frames and upload.kind != "video":
            raise AttachmentRejected("Only videos carry frames")
        content = _decode(upload.data, upload.name)
        if upload.kind in ("image", "view") and picture_type(content) is None:
            raise AttachmentRejected(f"{upload.name} is not a PNG, JPEG, WebP or GIF picture")
        frames = [_decode(frame, f"Frame {index}") for index, frame in enumerate(upload.frames)]
        frame_types = [picture_type(frame) for frame in frames]
        if None in frame_types:
            raise AttachmentRejected("Every frame must be a PNG, JPEG, WebP or GIF picture")
        text = _document_text(upload, media_type, content) if upload.kind == "document" else None
        token = secrets.token_hex(5)
        info = AttachmentInfo(
            id=f"{project_id}-{token}", kind=upload.kind, name=upload.name, media_type=media_type, size=len(content)
        )
        record = _Record(info=info, frames=[media for media in frame_types if media], has_text=text is not None)
        project_folder = self._root / project_id
        project_folder.mkdir(parents=True, exist_ok=True)
        # Written whole in a temporary folder and moved into place, so a reader never sees half an attachment.
        staging = Path(tempfile.mkdtemp(dir=project_folder, prefix=f"{token}.", suffix=".tmp"))
        try:
            (staging / CONTENT_FILE).write_bytes(content)
            if text is not None:
                (staging / TEXT_FILE).write_text(text, encoding="utf-8")
            (staging / FRAMES_FOLDER).mkdir()
            for index, frame in enumerate(frames):
                (staging / FRAMES_FOLDER / str(index)).write_bytes(frame)
            (staging / RECORD_FILE).write_text(record.model_dump_json(), encoding="utf-8")
            os.replace(staging, project_folder / token)
        except OSError:
            shutil.rmtree(staging, ignore_errors=True)
            raise
        return info

    def get(self, attachment_id: str) -> Attachment:
        match = ATTACHMENT_ID.fullmatch(attachment_id)
        if match is None or not PROJECT_ID.fullmatch(match.group(1)):
            raise UnknownAttachment(attachment_id)
        folder = self._root / match.group(1) / match.group(2)
        record_path = folder / RECORD_FILE
        if not record_path.is_file():
            raise UnknownAttachment(attachment_id)
        record = _Record.model_validate_json(record_path.read_text(encoding="utf-8"))
        return Attachment(record.info, folder, record.frames, record.has_text)

    def of_project(self, project_id: str, attachment_ids: list[str]) -> list[Attachment]:
        """The project's attachments by id; an id from another project is unknown here."""
        found = [self.get(attachment_id) for attachment_id in attachment_ids]
        for attachment in found:
            if not attachment.info.id.startswith(f"{project_id}-"):
                raise UnknownAttachment(attachment.info.id)
        return found

    def forget(self, project_id: str) -> None:
        if PROJECT_ID.fullmatch(project_id):
            shutil.rmtree(self._root / project_id, ignore_errors=True)
