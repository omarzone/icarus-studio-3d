"""A motion as one binary glTF 2.0 file (.glb): the skeleton's joints as nodes with a skin over a stick body, and one
animation whose keys are the motion's frames, so any glTF tool plays exactly what was tracked or simulated."""

import json
import struct

import numpy as np

from icarus.motion.skeleton import ENDS, SKELETON, SkeletonFrame

_FLOAT, _UNSIGNED_SHORT = 5126, 5123
_VERTICES, _INDICES = 34962, 34963
_GLB_MAGIC, _JSON_CHUNK, _BIN_CHUNK = 0x46546C67, 0x4E4F534A, 0x004E4942
# Half the width of the stick drawn for each bone, in metres.
_BONE_HALF_WIDTH = 0.025
_BOX_FACES = [
    (0, 1, 3), (0, 3, 2), (4, 6, 7), (4, 7, 5), (0, 4, 5), (0, 5, 1),
    (2, 3, 7), (2, 7, 6), (0, 2, 6), (0, 6, 4), (1, 5, 7), (1, 7, 3),
]  # fmt: skip


class _Buffer:
    """The binary chunk and the accessors that read it, one buffer view each."""

    def __init__(self) -> None:
        self.data = bytearray()
        self.views: list[dict[str, object]] = []
        self.accessors: list[dict[str, object]] = []

    def add(self, array: np.ndarray, kind: str, target: int | None = None, bounds: bool = False) -> int:
        component = _UNSIGNED_SHORT if array.dtype == np.uint16 else _FLOAT
        raw = np.ascontiguousarray(array).astype("<u2" if component == _UNSIGNED_SHORT else "<f4").tobytes()
        view: dict[str, object] = {"buffer": 0, "byteOffset": len(self.data), "byteLength": len(raw)}
        if target is not None:
            view["target"] = target
        self.data += raw + b"\0" * (-len(raw) % 4)
        self.views.append(view)
        accessor: dict[str, object] = {
            "bufferView": len(self.views) - 1,
            "componentType": component,
            "count": len(array),
            "type": kind,
        }
        if bounds:
            flat = array.reshape(len(array), -1)
            accessor["min"] = [float(value) for value in flat.min(axis=0)]
            accessor["max"] = [float(value) for value in flat.max(axis=0)]
        self.accessors.append(accessor)
        return len(self.accessors) - 1


def _rest_positions() -> list[np.ndarray]:
    """Each joint's position at rest in the model's space; no joint is turned at rest."""
    index = {joint: number for number, (joint, *_) in enumerate(SKELETON)}
    positions: list[np.ndarray] = []
    for _, parent, _, offset, _ in SKELETON:
        base = positions[index[parent]] if parent else np.zeros(3)
        positions.append(base + np.array(offset))
    return positions


def _bone_box(start: np.ndarray, end: np.ndarray) -> np.ndarray:
    """The eight corners of a thin box from one joint to the next."""
    axis = (end - start) / max(float(np.linalg.norm(end - start)), 1e-9)
    side = np.cross(axis, [0.0, 0.0, 1.0] if abs(axis[2]) < 0.9 else [1.0, 0.0, 0.0])
    side = side / np.linalg.norm(side) * _BONE_HALF_WIDTH
    depth = np.cross(axis, side)
    return np.array([point + a * side + b * depth for point in (start, end) for a in (-1, 1) for b in (-1, 1)])


def _body(positions: list[np.ndarray]) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """A stick for every bone, each bound fully to its joint: corners, joint indices and triangle indices."""
    children = {parent: joint for joint, parent, *_ in reversed(SKELETON) if parent}
    index = {joint: number for number, (joint, *_) in enumerate(SKELETON)}
    corners, joints, triangles = [], [], []
    for number, (joint, *_) in enumerate(SKELETON):
        tip = positions[index[children[joint]]] if joint in children else positions[number] + np.array(ENDS[joint])
        first = len(corners) * 8
        corners.append(_bone_box(positions[number], tip))
        joints += [[number, 0, 0, 0]] * 8
        triangles += [[first + corner for corner in face] for face in _BOX_FACES]
    return np.concatenate(corners), np.array(joints, dtype=np.uint16), np.array(triangles, dtype=np.uint16)


def gltf_motion(poses: list[SkeletonFrame], fps: float, name: str) -> bytes:
    """The poses as a .glb file at `fps` frames per second; glTF's Y-up axes match the skeleton's side view."""
    buffer = _Buffer()
    positions = _rest_positions()
    corners, joints, triangles = _body(positions)
    weights = np.tile(np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32), (len(corners), 1))
    primitive = {
        "attributes": {
            "POSITION": buffer.add(corners.astype(np.float32), "VEC3", _VERTICES, bounds=True),
            "JOINTS_0": buffer.add(joints, "VEC4", _VERTICES),
            "WEIGHTS_0": buffer.add(weights, "VEC4", _VERTICES),
        },
        "indices": buffer.add(triangles.reshape(-1), "SCALAR", _INDICES),
        "material": 0,
    }
    inverse_binds = np.tile(np.eye(4, dtype=np.float32), (len(SKELETON), 1, 1))
    inverse_binds[:, 3, :3] = -np.array(positions)
    skin = {
        "joints": list(range(len(SKELETON))),
        "skeleton": 0,
        "inverseBindMatrices": buffer.add(inverse_binds, "MAT4"),
    }

    index = {joint: number for number, (joint, *_) in enumerate(SKELETON)}
    children: dict[str, list[int]] = {}
    for joint, parent, *_ in SKELETON:
        if parent:
            children.setdefault(parent, []).append(index[joint])
    nodes: list[dict[str, object]] = []
    for joint, _, _, offset, _ in SKELETON:
        node: dict[str, object] = {"name": joint, "translation": list(offset)}
        if joint in children:
            node["children"] = children[joint]
        nodes.append(node)
    nodes.append({"name": "Body", "mesh": 0, "skin": 0})

    document: dict[str, object] = {
        "asset": {"version": "2.0", "generator": "Icarus Studio 3D"},
        "scene": 0,
        "scenes": [{"name": name, "nodes": [0, len(SKELETON)]}],
        "nodes": nodes,
        "meshes": [{"name": "Body", "primitives": [primitive]}],
        "materials": [{"name": "Body", "doubleSided": True, "pbrMetallicRoughness": {"metallicFactor": 0.0}}],
        "skins": [skin],
    }
    if poses:
        document["animations"] = [_animation(buffer, poses, fps, name)]
    document["buffers"] = [{"byteLength": len(buffer.data)}]
    document["bufferViews"] = buffer.views
    document["accessors"] = buffer.accessors
    return _glb(document, bytes(buffer.data))


def _animation(buffer: _Buffer, poses: list[SkeletonFrame], fps: float, name: str) -> dict[str, object]:
    """One rotation channel per joint about the axis toward the viewer and the root's translation, keyed per frame."""
    times = buffer.add(np.arange(len(poses), dtype=np.float32) / np.float32(fps), "SCALAR", bounds=True)
    turns = np.array([pose.turns for pose in poses], dtype=np.float64)
    samplers: list[dict[str, object]] = []
    channels: list[dict[str, object]] = []
    for number in range(len(SKELETON)):
        half = turns[:, number] / 2
        quaternions = np.stack([np.zeros_like(half), np.zeros_like(half), np.sin(half), np.cos(half)], axis=1)
        samplers.append({"input": times, "output": buffer.add(quaternions.astype(np.float32), "VEC4")})
        channels.append({"sampler": len(samplers) - 1, "target": {"node": number, "path": "rotation"}})
    rest = np.array(SKELETON[0][3])
    roots = np.array([pose.root for pose in poses], dtype=np.float64) + rest
    samplers.append({"input": times, "output": buffer.add(roots.astype(np.float32), "VEC3")})
    channels.append({"sampler": len(samplers) - 1, "target": {"node": 0, "path": "translation"}})
    for sampler in samplers:
        sampler["interpolation"] = "LINEAR"
    return {"name": name, "samplers": samplers, "channels": channels}


def _glb(document: dict[str, object], binary: bytes) -> bytes:
    text = json.dumps(document, separators=(",", ":"), allow_nan=False).encode()
    text += b" " * (-len(text) % 4)
    binary += b"\0" * (-len(binary) % 4)
    length = 12 + 8 + len(text) + 8 + len(binary)
    return b"".join(
        [
            struct.pack("<III", _GLB_MAGIC, 2, length),
            struct.pack("<II", len(text), _JSON_CHUNK),
            text,
            struct.pack("<II", len(binary), _BIN_CHUNK),
            binary,
        ]
    )
