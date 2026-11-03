"""What makes a glTF or GLB model safe to keep as a skin, and how big it is (ADR 008)."""

import json
import struct
from dataclasses import dataclass
from typing import Literal

import numpy as np

MAX_SKIN_BYTES = 15 * 1024 * 1024
_GLB_MAGIC = b"glTF"
_JSON_CHUNK = 0x4E4F534A
_BIN_CHUNK = 0x004E4942
# Extensions the desktop's loader would need a separate decoder for, which the studio does not ship.
_NEEDS_DECODER = frozenset(
    {"KHR_draco_mesh_compression", "EXT_meshopt_compression", "KHR_texture_basisu", "KHR_mesh_quantization"}
)
_MAX_NODE_VISITS = 100_000
_TRIANGLES = 4


class SkinRejected(ValueError):
    """A model file that cannot be a skin, with a sentence a person can read."""


@dataclass(frozen=True)
class SkinFile:
    format: Literal["glb", "gltf"]
    # Full extents on the engine's axes (glTF is Y-up; the engine is Z-up).
    bounds: tuple[float, float, float]
    triangles: int


def _glb_document(data: bytes) -> tuple[dict[str, object], bool]:
    document, binary = glb_parts(data)
    return document, binary is not None


def glb_parts(data: bytes) -> tuple[dict[str, object], bytes | None]:
    """A GLB file's description and its binary chunk, when it has one."""
    if len(data) < 20:
        raise SkinRejected("The GLB file is cut short")
    _, version, length = struct.unpack_from("<4sII", data, 0)
    if version != 2:
        raise SkinRejected(f"Only glTF 2.0 models can be skins, not version {version}")
    if length != len(data):
        raise SkinRejected("The GLB file's length does not match its header")
    offset, chunks = 12, []
    while offset < length:
        if offset + 8 > length:
            raise SkinRejected("The GLB file has a broken chunk")
        size, kind = struct.unpack_from("<II", data, offset)
        if offset + 8 + size > length:
            raise SkinRejected("The GLB file has a chunk longer than the file")
        chunks.append((kind, data[offset + 8 : offset + 8 + size]))
        offset += 8 + size
    kinds = [kind for kind, _ in chunks]
    if kinds not in ([_JSON_CHUNK], [_JSON_CHUNK, _BIN_CHUNK]):
        raise SkinRejected("A GLB file holds its description and at most one binary chunk, and nothing else")
    return parse_gltf(chunks[0][1]), chunks[1][1] if len(chunks) == 2 else None


def parse_gltf(text: bytes) -> dict[str, object]:
    try:
        document = json.loads(text.decode("utf-8-sig"))
    except (UnicodeDecodeError, ValueError, RecursionError) as error:
        raise SkinRejected("The model's description is not valid JSON") from error
    if not isinstance(document, dict):
        raise SkinRejected("The model's description is not a glTF document")
    return document


def gltf_items(document: dict[str, object], key: str) -> list[dict[str, object]]:
    value = document.get(key, [])
    if not isinstance(value, list) or not all(isinstance(item, dict) for item in value):
        raise SkinRejected(f"The model's {key} are malformed")
    return value


def _check_links(document: dict[str, object], has_binary: bool) -> None:
    """Every buffer and picture lives inside the file: a data URI or the GLB's own binary chunk."""
    stack: list[object] = [document]
    while stack:
        item = stack.pop()
        if isinstance(item, dict):
            uri = item.get("uri")
            if uri is not None and not (isinstance(uri, str) and uri.startswith("data:")):
                raise SkinRejected("The model points to files outside itself; embed its buffers and textures")
            stack.extend(item.values())
        elif isinstance(item, list):
            stack.extend(item)
    for index, buffer in enumerate(gltf_items(document, "buffers")):
        if "uri" not in buffer and not (index == 0 and has_binary):
            raise SkinRejected("A buffer of the model has no data")
    for image in gltf_items(document, "images"):
        if "uri" not in image and "bufferView" not in image:
            raise SkinRejected("A texture of the model has no data")


def _check_extensions(document: dict[str, object]) -> None:
    used = document.get("extensionsUsed", [])
    if not isinstance(used, list):
        raise SkinRejected("The model's extensions are malformed")
    blocked = sorted(str(name) for name in used if name in _NEEDS_DECODER)
    if blocked:
        raise SkinRejected(f"The model is compressed with {', '.join(blocked)}; export it without compression")


def _vector(value: object, length: int, default: list[float]) -> list[float]:
    if value is None:
        return default
    if not isinstance(value, list) or len(value) != length or not all(isinstance(x, int | float) for x in value):
        raise SkinRejected("A node of the model has a malformed transform")
    return [float(x) for x in value]


def node_matrix(node: dict[str, object]) -> np.ndarray:
    if "matrix" in node:
        return np.array(_vector(node["matrix"], 16, []), dtype=float).reshape(4, 4).T
    tx, ty, tz = _vector(node.get("translation"), 3, [0, 0, 0])
    x, y, z, w = _vector(node.get("rotation"), 4, [0, 0, 0, 1])
    sx, sy, sz = _vector(node.get("scale"), 3, [1, 1, 1])
    rotation = np.array(
        [
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ]
    )
    matrix = np.eye(4)
    matrix[:3, :3] = rotation * np.array([sx, sy, sz])
    matrix[:3, 3] = (tx, ty, tz)
    return matrix


def gltf_item(value: object, items: list[dict[str, object]], what: str) -> dict[str, object]:
    if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value < len(items):
        raise SkinRejected(f"The model refers to a {what} it does not have")
    return items[value]


def scene_roots(document: dict[str, object], nodes: list[dict[str, object]]) -> list[object]:
    scenes = gltf_items(document, "scenes")
    if scenes:
        scene = gltf_item(document.get("scene", 0), scenes, "scene")
        roots = scene.get("nodes", [])
        return roots if isinstance(roots, list) else []
    children: set[int] = set()
    for node in nodes:
        listed = node.get("children", [])
        children.update(child for child in (listed if isinstance(listed, list) else []) if isinstance(child, int))
    return [index for index in range(len(nodes)) if index not in children]


def _primitive_corners(primitive: dict[str, object], accessors: list[dict[str, object]]) -> tuple[np.ndarray, int]:
    attributes = primitive.get("attributes")
    if not isinstance(attributes, dict) or "POSITION" not in attributes:
        raise SkinRejected("A mesh of the model has no positions")
    accessor = gltf_item(attributes["POSITION"], accessors, "position list")
    if "min" not in accessor or "max" not in accessor:
        raise SkinRejected("A mesh of the model has positions without bounds")
    low, high = _vector(accessor.get("min"), 3, []), _vector(accessor.get("max"), 3, [])
    corners = np.array(
        [[x, y, z, 1.0] for x in (low[0], high[0]) for y in (low[1], high[1]) for z in (low[2], high[2])]
    )
    if primitive.get("mode", _TRIANGLES) != _TRIANGLES:
        return corners, 0
    counted = gltf_item(primitive["indices"], accessors, "index list") if "indices" in primitive else accessor
    count = counted.get("count", 0)
    return corners, count // 3 if isinstance(count, int) else 0


def _extents(document: dict[str, object]) -> tuple[np.ndarray, int]:
    nodes, meshes, accessors = (
        gltf_items(document, "nodes"),
        gltf_items(document, "meshes"),
        gltf_items(document, "accessors"),
    )
    low, high = np.full(3, np.inf), np.full(3, -np.inf)
    triangles, visits = 0, 0
    stack = [(index, np.eye(4)) for index in scene_roots(document, nodes)]
    while stack:
        index, parent = stack.pop()
        visits += 1
        if visits > _MAX_NODE_VISITS:
            raise SkinRejected("The model's node tree loops or is too large")
        node = gltf_item(index, nodes, "node")
        world = parent @ node_matrix(node)
        if "mesh" in node:
            primitives = gltf_item(node["mesh"], meshes, "mesh").get("primitives", [])
            for primitive in primitives if isinstance(primitives, list) else []:
                if not isinstance(primitive, dict):
                    raise SkinRejected("A mesh of the model is malformed")
                corners, count = _primitive_corners(primitive, accessors)
                placed = (world @ corners.T).T[:, :3]
                low, high = np.minimum(low, placed.min(axis=0)), np.maximum(high, placed.max(axis=0))
                triangles += count
        children = node.get("children", [])
        stack.extend((child, world) for child in (children if isinstance(children, list) else []))
    if not np.all(np.isfinite(low)) or not np.all(np.isfinite(high)):
        raise SkinRejected("The model has no mesh to draw")
    return high - low, triangles


def read_skin(data: bytes) -> SkinFile:
    """Check a model file and measure it; raises SkinRejected with the reason when it cannot be a skin."""
    if len(data) > MAX_SKIN_BYTES:
        raise SkinRejected(f"The model is larger than {MAX_SKIN_BYTES // (1024 * 1024)} MB")
    if data[:4] == _GLB_MAGIC:
        document, has_binary = _glb_document(data)
        format: Literal["glb", "gltf"] = "glb"
    elif data.lstrip(b"\xef\xbb\xbf \t\r\n")[:1] == b"{":
        document, has_binary, format = parse_gltf(data), False, "gltf"
    else:
        raise SkinRejected("The file is not a glTF or GLB model")
    asset = document.get("asset")
    version = asset.get("version") if isinstance(asset, dict) else None
    if not isinstance(version, str) or not version.startswith("2."):
        raise SkinRejected("Only glTF 2.0 models can be skins")
    _check_links(document, has_binary)
    _check_extensions(document)
    size, triangles = _extents(document)
    x, y, z = (float(value) for value in size)
    return SkinFile(format=format, bounds=(round(x, 6), round(z, 6), round(y, 6)), triangles=triangles)
