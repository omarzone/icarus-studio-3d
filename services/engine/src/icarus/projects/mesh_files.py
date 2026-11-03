"""Triangle meshes read from OBJ, STL, glTF and GLB files on the engine's axes, and written back as GLB models."""

import base64
import json
import re
import struct
from dataclasses import dataclass
from pathlib import PurePath

import numpy as np

from icarus.projects.skin_files import (
    MAX_SKIN_BYTES,
    SkinRejected,
    glb_parts,
    gltf_item,
    gltf_items,
    node_matrix,
    parse_gltf,
    scene_roots,
)

MESH_SUFFIXES = (".obj", ".stl", ".glb", ".gltf")
MAX_TRIANGLES = 400_000
_COMPONENTS = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
_WIDTH = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
_TRIANGLES = 4
_MAX_NODE_VISITS = 100_000
# glTF and OBJ are Y-up with Z toward the viewer; the engine is Z-up: (x, y, z) engine = (x, -z, y) file.
_Y_UP = np.array([[1.0, 0.0, 0.0], [0.0, 0.0, -1.0], [0.0, 1.0, 0.0]])


@dataclass(frozen=True)
class Mesh:
    # Vertex positions on the engine's axes (Z up) and triangles as vertex indices.
    vertices: np.ndarray
    triangles: np.ndarray

    @property
    def bounds(self) -> tuple[np.ndarray, np.ndarray]:
        return self.vertices.min(axis=0), self.vertices.max(axis=0)


def _checked(vertices: np.ndarray, triangles: np.ndarray) -> Mesh:
    if len(triangles) == 0 or len(vertices) < 3:
        raise SkinRejected("The model has no triangles")
    if len(triangles) > MAX_TRIANGLES:
        raise SkinRejected(f"The model has more than {MAX_TRIANGLES:,} triangles")
    if not np.all(np.isfinite(vertices)):
        raise SkinRejected("The model has positions that are not numbers")
    if triangles.min() < 0 or triangles.max() >= len(vertices):
        raise SkinRejected("The model has triangles that point to missing vertices")
    return Mesh(vertices.astype(float), triangles.astype(np.int64))


def _obj(data: bytes) -> Mesh:
    vertices: list[list[float]] = []
    faces: list[list[int]] = []
    for raw in data.decode("utf-8", errors="replace").splitlines():
        parts = raw.split()
        if not parts:
            continue
        if parts[0] == "v" and len(parts) >= 4:
            try:
                vertices.append([float(value) for value in parts[1:4]])
            except ValueError as error:
                raise SkinRejected("The OBJ file has a vertex that is not three numbers") from error
        elif parts[0] == "f" and len(parts) >= 4:
            try:
                corners = [int(corner.split("/")[0]) for corner in parts[1:]]
            except ValueError as error:
                raise SkinRejected("The OBJ file has a face that is not vertex numbers") from error
            indices = [index - 1 if index > 0 else len(vertices) + index for index in corners]
            faces += [[indices[0], indices[step], indices[step + 1]] for step in range(1, len(indices) - 1)]
    if not vertices:
        raise SkinRejected("The OBJ file has no vertices")
    return _checked(np.array(vertices) @ _Y_UP.T, np.array(faces, dtype=np.int64).reshape(-1, 3))


_ASCII_VERTEX = re.compile(rb"vertex\s+(\S+)\s+(\S+)\s+(\S+)")


def _stl(data: bytes) -> Mesh:
    if len(data) >= 84:
        count = struct.unpack_from("<I", data, 80)[0]
        if count and 84 + count * 50 == len(data):
            table = np.frombuffer(
                data, dtype=np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")]), count=count, offset=84
            )
            corners = table["v"].reshape(-1, 3).astype(float)
            return _checked(corners, np.arange(len(corners)).reshape(-1, 3))
    if data.lstrip()[:5].lower() == b"solid":
        try:
            corners = np.array([[float(x) for x in match] for match in _ASCII_VERTEX.findall(data)])
        except ValueError as error:
            raise SkinRejected("The STL file has a vertex that is not three numbers") from error
        if len(corners) == 0 or len(corners) % 3:
            raise SkinRejected("The STL file's triangles are incomplete")
        return _checked(corners, np.arange(len(corners)).reshape(-1, 3))
    raise SkinRejected("The file is not a binary or text STL model")


def _buffer(document: dict[str, object], index: int, binary: bytes | None) -> bytes:
    buffer = gltf_item(index, gltf_items(document, "buffers"), "buffer")
    uri = buffer.get("uri")
    if uri is None:
        if index != 0 or binary is None:
            raise SkinRejected("A buffer of the model has no data")
        return binary
    if not isinstance(uri, str) or not uri.startswith("data:") or "," not in uri:
        raise SkinRejected("The model points to files outside itself; embed its buffers")
    try:
        return base64.b64decode(uri.split(",", 1)[1], validate=True)
    except ValueError as error:
        raise SkinRejected("A buffer of the model is not valid base64") from error


def _accessor(document: dict[str, object], index: object, binary: bytes | None) -> np.ndarray:
    accessor = gltf_item(index, gltf_items(document, "accessors"), "accessor")
    if "sparse" in accessor or "bufferView" not in accessor:
        raise SkinRejected("The model stores positions in a way the studio cannot read; export it plainly")
    component = _COMPONENTS.get(accessor.get("componentType"))  # type: ignore[arg-type]
    width = _WIDTH.get(str(accessor.get("type")))
    count = accessor.get("count")
    if component is None or width is None or not isinstance(count, int):
        raise SkinRejected("The model has an accessor of a kind the studio cannot read")
    view = gltf_item(accessor["bufferView"], gltf_items(document, "bufferViews"), "buffer view")
    data = _buffer(document, int(view.get("buffer", 0)), binary)  # type: ignore[arg-type]
    start = int(view.get("byteOffset", 0)) + int(accessor.get("byteOffset", 0))  # type: ignore[arg-type]
    item = np.dtype(component).itemsize * width
    stride = int(view.get("byteStride", item))  # type: ignore[arg-type]
    if count and start + stride * (count - 1) + item > len(data):
        raise SkinRejected("The model's data is shorter than it says")
    rows = np.lib.stride_tricks.as_strided(
        np.frombuffer(data, dtype=np.uint8, offset=start), shape=(count, item), strides=(stride, 1)
    )
    return np.frombuffer(rows.copy().tobytes(), dtype=component).reshape(count, width)


def _gltf(document: dict[str, object], binary: bytes | None) -> Mesh:
    nodes, meshes = gltf_items(document, "nodes"), gltf_items(document, "meshes")
    vertices: list[np.ndarray] = []
    triangles: list[np.ndarray] = []
    offset, visits = 0, 0
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
                if not isinstance(primitive, dict) or primitive.get("mode", _TRIANGLES) != _TRIANGLES:
                    continue
                attributes = primitive.get("attributes")
                if not isinstance(attributes, dict) or "POSITION" not in attributes:
                    continue
                positions = _accessor(document, attributes["POSITION"], binary).astype(float)
                placed = (np.c_[positions, np.ones(len(positions))] @ world.T)[:, :3]
                if "indices" in primitive:
                    order = _accessor(document, primitive["indices"], binary).reshape(-1).astype(np.int64)
                else:
                    order = np.arange(len(positions))
                vertices.append(placed)
                triangles.append(order[: len(order) // 3 * 3].reshape(-1, 3) + offset)
                offset += len(positions)
        children = node.get("children", [])
        stack.extend((child, world) for child in (children if isinstance(children, list) else []))
    if not vertices:
        raise SkinRejected("The model has no mesh to read")
    return _checked(np.concatenate(vertices) @ _Y_UP.T, np.concatenate(triangles))


def read_mesh(name: str, data: bytes) -> Mesh:
    """The triangles of a model file, chosen by its content and name; raises SkinRejected with the reason."""
    if len(data) > MAX_SKIN_BYTES:
        raise SkinRejected(f"The model is larger than {MAX_SKIN_BYTES // (1024 * 1024)} MB")
    suffix = PurePath(name).suffix.lower()
    if data[:4] == b"glTF":
        return _gltf(*glb_parts(data))
    if suffix == ".gltf" or (suffix != ".obj" and data.lstrip(b"\xef\xbb\xbf \t\r\n")[:1] == b"{"):
        return _gltf(parse_gltf(data), None)
    if suffix == ".stl":
        return _stl(data)
    if suffix == ".obj":
        return _obj(data)
    raise SkinRejected("Import .obj, .stl, .glb or .gltf models")


def _normals(vertices: np.ndarray, triangles: np.ndarray) -> np.ndarray:
    corners = vertices[triangles]
    faces = np.cross(corners[:, 1] - corners[:, 0], corners[:, 2] - corners[:, 0])
    normals = np.zeros_like(vertices)
    for column in range(3):
        np.add.at(normals, triangles[:, column], faces)
    lengths = np.linalg.norm(normals, axis=1, keepdims=True)
    return np.where(lengths > 1e-12, normals / np.maximum(lengths, 1e-12), np.array([0.0, 0.0, 1.0]))


def _rgba(color: str) -> list[float]:
    value = color.lstrip("#")
    return [int(value[index : index + 2], 16) / 255 for index in (0, 2, 4)] + [1.0]


def write_glb(mesh: Mesh, color: str = "#9aa0a8") -> bytes:
    """A GLB model of the mesh with smooth normals and one plain material, back on glTF's Y-up axes."""
    used = np.unique(mesh.triangles)
    remap = np.full(len(mesh.vertices), -1, dtype=np.int64)
    remap[used] = np.arange(len(used))
    vertices = (mesh.vertices[used] @ _Y_UP).astype(np.float32)
    triangles = remap[mesh.triangles].astype(np.uint32)
    normals = _normals(vertices.astype(float), triangles.astype(np.int64)).astype(np.float32)
    blobs = [vertices.tobytes(), normals.tobytes(), triangles.tobytes()]
    views, offset = [], 0
    for index, blob in enumerate(blobs):
        view: dict[str, object] = {"buffer": 0, "byteOffset": offset, "byteLength": len(blob)}
        view["target"] = 34963 if index == 2 else 34962
        views.append(view)
        offset += len(blob)
    document = {
        "asset": {"version": "2.0", "generator": "Icarus Studio 3D"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "materials": [{"pbrMetallicRoughness": {"baseColorFactor": _rgba(color), "roughnessFactor": 0.8}}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "material": 0}]}],
        "buffers": [{"byteLength": offset}],
        "bufferViews": views,
        "accessors": [
            {
                "bufferView": 0,
                "componentType": 5126,
                "count": len(vertices),
                "type": "VEC3",
                "min": vertices.min(axis=0).tolist(),
                "max": vertices.max(axis=0).tolist(),
            },
            {"bufferView": 1, "componentType": 5126, "count": len(normals), "type": "VEC3"},
            {"bufferView": 2, "componentType": 5125, "count": int(triangles.size), "type": "SCALAR"},
        ],
    }
    text = json.dumps(document, separators=(",", ":")).encode("utf-8")
    text += b" " * (-len(text) % 4)
    binary = b"".join(blobs)
    binary += b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(text) + 8 + len(binary)
    header = struct.pack("<4sII", b"glTF", 2, total)
    return (
        header + struct.pack("<II", len(text), 0x4E4F534A) + text + struct.pack("<II", len(binary), 0x004E4942) + binary
    )


def as_glb(name: str, data: bytes) -> tuple[str, bytes]:
    """A model file ready to keep as a skin: glTF and GLB as they are, OBJ and STL converted to GLB."""
    suffix = PurePath(name).suffix.lower()
    if suffix in (".obj", ".stl"):
        return f"{PurePath(name).stem}.glb", write_glb(read_mesh(name, data))
    return name, data
