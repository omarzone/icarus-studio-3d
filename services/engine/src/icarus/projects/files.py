import os
import tempfile
from pathlib import Path


def write_atomic(path: Path, text: str) -> None:
    """Replace a file in one step so readers never see a half-written document."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=path.parent, prefix=f"{path.name}.", suffix=".tmp", delete=False
    ) as handle:
        handle.write(text)
    try:
        os.replace(handle.name, path)
    except OSError:
        Path(handle.name).unlink(missing_ok=True)
        raise


def append_line(path: Path, line: str) -> None:
    """Append one line, starting it on a new line when a killed writer left the last one unfinished."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as handle:
        unfinished = False
        if handle.seek(0, os.SEEK_END) > 0:
            handle.seek(-1, os.SEEK_END)
            unfinished = handle.read(1) != b"\n"
        handle.write(f"{'\n' if unfinished else ''}{line.rstrip('\n')}\n".encode())
