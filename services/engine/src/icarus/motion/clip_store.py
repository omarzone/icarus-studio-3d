"""Reference clips kept in each project's folder: the frames the app sampled from a video and the tracked pose."""

import base64
import binascii
import secrets
import shutil
from datetime import UTC, datetime
from pathlib import Path

from icarus.contracts.motion import MotionClip, MotionVideo, MotionVideoUpload
from icarus.copilot.attachments import picture_type
from icarus.projects.files import write_atomic, write_atomic_bytes
from icarus.projects.store import PROJECT_ID

FOLDER = "motion"
CLIP_FILE = "clip.json"
FRAMES = "frames"
MAX_FRAME_BYTES = 2 * 1024 * 1024


class UnknownClip(LookupError):
    pass


class ClipRejected(ValueError):
    """A video upload that cannot become a clip, with a sentence a person can read."""


def _picture(data: str, index: int) -> tuple[bytes, str]:
    try:
        picture = base64.b64decode("".join(data.split()), validate=True)
    except (binascii.Error, ValueError) as error:
        raise ClipRejected(f"Frame {index + 1} is not valid base64") from error
    media = picture_type(picture)
    if media not in ("image/jpeg", "image/png"):
        raise ClipRejected(f"Frame {index + 1} is not a JPEG or PNG picture")
    if len(picture) > MAX_FRAME_BYTES:
        raise ClipRejected(f"Frame {index + 1} is larger than {MAX_FRAME_BYTES // (1024 * 1024)} MB")
    return picture, media


class ClipStore:
    """One folder per clip inside the project's folder; the newest clip is the one the motion workspace shows."""

    def __init__(self, projects_root: Path) -> None:
        self._root = projects_root

    def _project(self, project_id: str) -> Path:
        if not PROJECT_ID.fullmatch(project_id) or not (self._root / project_id).is_dir():
            raise UnknownClip(project_id)
        return self._root / project_id / FOLDER

    def _folder(self, project_id: str, clip_id: str) -> Path:
        folder = self._project(project_id) / clip_id
        if not clip_id.isalnum() or not (folder / CLIP_FILE).is_file():
            raise UnknownClip(clip_id)
        return folder

    def add(self, project_id: str, upload: MotionVideoUpload, target: str | None) -> MotionClip:
        pictures = [_picture(frame, index) for index, frame in enumerate(upload.frames)]
        clip_id = f"c{secrets.token_hex(5)}"
        folder = self._project(project_id) / clip_id
        video = MotionVideo(
            name=upload.name,
            duration=upload.duration,
            start=upload.start,
            fps=upload.fps,
            width=upload.width,
            height=upload.height,
            frames=len(pictures),
        )
        clip = MotionClip(id=clip_id, video=video, target=target, created_at=datetime.now(UTC))
        try:
            for index, (picture, media) in enumerate(pictures):
                suffix = "png" if media == "image/png" else "jpg"
                write_atomic_bytes(folder / FRAMES / f"{index}.{suffix}", picture)
            self.save(project_id, clip, folder)
        except OSError:
            shutil.rmtree(folder, ignore_errors=True)
            raise
        return clip

    def save(self, project_id: str, clip: MotionClip, folder: Path | None = None) -> None:
        target = folder or self._folder(project_id, clip.id)
        write_atomic(target / CLIP_FILE, clip.model_dump_json())

    def get(self, project_id: str, clip_id: str) -> MotionClip:
        path = self._folder(project_id, clip_id) / CLIP_FILE
        return MotionClip.model_validate_json(path.read_text(encoding="utf-8"))

    def latest(self, project_id: str) -> MotionClip | None:
        try:
            root = self._project(project_id)
        except UnknownClip:
            return None
        clips = [
            MotionClip.model_validate_json((folder / CLIP_FILE).read_text(encoding="utf-8"))
            for folder in (root.iterdir() if root.is_dir() else [])
            if (folder / CLIP_FILE).is_file()
        ]
        return max(clips, key=lambda clip: clip.created_at) if clips else None

    def frame(self, project_id: str, clip_id: str, index: int) -> tuple[bytes, str]:
        folder = self._folder(project_id, clip_id) / FRAMES
        for suffix, media in (("jpg", "image/jpeg"), ("png", "image/png")):
            path = folder / f"{index}.{suffix}"
            if path.is_file():
                return path.read_bytes(), media
        raise UnknownClip(f"{clip_id}/{index}")
