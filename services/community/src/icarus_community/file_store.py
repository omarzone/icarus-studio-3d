import os
import re
from pathlib import Path
from typing import Protocol

KEY_PATTERN = re.compile(r"^[a-z]+/[a-f0-9]{32}\.(json|png|jpg|webp)$")


class FileStore(Protocol):
    """Where bundles, thumbnails and photos live; a local folder now, an object store later."""

    def put(self, key: str, data: bytes) -> None: ...

    def get(self, key: str) -> bytes: ...

    def delete(self, key: str) -> None: ...


class LocalFileStore:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        # Keys are made by the service, never taken from a request, and still checked before they touch the disk.
        if not KEY_PATTERN.match(key):
            raise ValueError(f"Not a storage key: {key}")
        return self.root / key

    def put(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(f"{path.suffix}.tmp")
        temporary.write_bytes(data)
        os.replace(temporary, path)

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)
