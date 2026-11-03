import base64
import binascii
import math
import re
from collections.abc import Iterator
from pathlib import PurePath

from icarus.contracts.operations import CreateObject, OperationBatch
from icarus.contracts.skins import SkinImport, SkinImported, SkinInfo
from icarus.library.skin_objects import skin_object, skin_size
from icarus.projects.document import all_objects
from icarus.projects.skin_files import SkinRejected
from icarus.projects.skins import SkinStore
from icarus.projects.store import ProjectStore, RejectedBatch

# Rings of spots tried around the asked position when the model would block the start or the goal.
_RINGS = 3


def _decode(data: str) -> bytes:
    try:
        return base64.b64decode("".join(data.split()), validate=True)
    except (binascii.Error, ValueError) as error:
        raise SkinRejected("The model is not valid base64") from error


def _label(file_name: str) -> str:
    stem = PurePath(file_name).stem.replace("_", " ").replace("-", " ").strip()
    return (stem[:1].upper() + stem[1:])[:80] or "Model"


def _free_id(label: str, taken: set[str]) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")[:48] or "model"
    candidate, number = base, 2
    while candidate in taken:
        candidate, number = f"{base}-{number}", number + 1
    return candidate


def store_model(skins: SkinStore, project_id: str, name: str, data: str) -> SkinInfo:
    """Keep a model attached in the chat as a skin, so the copilot can put it on an object by its id."""
    return skins.add(project_id, name, _decode(data))


def import_skin(store: ProjectStore, skins: SkinStore, project_id: str, upload: SkinImport) -> SkinImported:
    """Keep a model as a skin and add an object that wears it, fitted to its size, in one revision."""
    project = store.state(project_id).project
    info = skins.add(project_id, upload.name, _decode(upload.data))
    label = _label(upload.name)
    object_id = _free_id(label, {item.id for item in all_objects(project)})
    size = skin_size(info.bounds, upload.length)
    first: RejectedBatch | None = None
    for position in _spots(upload.position, max(size)):
        obj = skin_object(
            object_id,
            label,
            info.id,
            size,
            position=position,
            collider=upload.collider,
            mode=upload.mode,
            density=upload.density,
        )
        batch = OperationBatch(
            operations=[CreateObject(op="create_object", target=upload.target, object=obj)],
            summary=f"Imported {label}",
        )
        try:
            state = store.apply(project_id, batch)
        except RejectedBatch as rejected:
            first = first or rejected
            # Only a spot that blocks the start or the goal is worth another try; anything else fails everywhere.
            if any(issue.path != "reachable" for issue in rejected.issues):
                raise
            continue
        return SkinImported(skin=info, object=obj.id, revision=state.revision.number)
    assert first is not None
    raise first


def _spots(start: tuple[float, float, float], length: float) -> Iterator[tuple[float, float, float]]:
    """The asked position, then rings around it a little wider than the model, nearest first."""
    yield start
    x, y, z = start
    for ring in range(1, _RINGS + 1):
        distance = ring * (length + 1)
        for step in range(8):
            angle = step * math.pi / 4
            yield (round(x + distance * math.cos(angle), 3), round(y + distance * math.sin(angle), 3), z)
