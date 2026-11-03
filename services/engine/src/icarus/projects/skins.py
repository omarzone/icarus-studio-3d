import hashlib
from pathlib import Path

from icarus.contracts.skins import SkinInfo
from icarus.library.skin_objects import SKIN_ID
from icarus.projects.files import write_atomic, write_atomic_bytes
from icarus.projects.skin_files import SkinRejected, read_skin
from icarus.projects.store import PROJECT_ID

SKINS_FOLDER = "skins"

MEDIA_TYPES = {"glb": "model/gltf-binary", "gltf": "model/gltf+json"}


def skin_id(data: bytes) -> str:
    return f"sk{hashlib.sha256(data).hexdigest()[:16]}"


class UnknownSkin(LookupError):
    pass


class SkinStore:
    """Models kept inside each project's folder under ids taken from their content, so the same file is stored once."""

    def __init__(self, projects_root: Path) -> None:
        self._root = projects_root

    def _folder(self, project_id: str) -> Path:
        if not PROJECT_ID.fullmatch(project_id) or not (self._root / project_id).is_dir():
            raise UnknownSkin(project_id)
        return self._root / project_id / SKINS_FOLDER

    def add(self, project_id: str, name: str, data: bytes) -> SkinInfo:
        """Check, measure and keep a model file; raises SkinRejected when it cannot be a skin."""
        folder = self._folder(project_id)
        measured = read_skin(data)
        info = SkinInfo(
            id=skin_id(data),
            name=name,
            format=measured.format,
            size=len(data),
            bounds=measured.bounds,
            triangles=measured.triangles,
        )
        content = folder / f"{info.id}.{info.format}"
        if not content.is_file():
            write_atomic_bytes(content, data)
        write_atomic(folder / f"{info.id}.json", info.model_dump_json())
        return info

    def info(self, project_id: str, asset: str) -> SkinInfo:
        record = self._folder(project_id) / f"{asset}.json"
        if not SKIN_ID.fullmatch(asset) or not record.is_file():
            raise UnknownSkin(asset)
        return SkinInfo.model_validate_json(record.read_text(encoding="utf-8"))

    def content(self, project_id: str, asset: str) -> tuple[Path, str]:
        """The stored file and its media type."""
        info = self.info(project_id, asset)
        return self._folder(project_id) / f"{info.id}.{info.format}", MEDIA_TYPES[info.format]


__all__ = ["SKIN_ID", "SkinRejected", "SkinStore", "UnknownSkin", "skin_id"]
