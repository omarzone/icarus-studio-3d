"""Tiny glTF models built in memory, so skin tests never read or download a file."""

import base64
import json
import struct

# One triangle whose positions span 2 × 1 × 0.5 in glTF axes (X, Y-up, Z).
_POSITIONS = struct.pack("<9f", 0, 0, 0, 2, 0, 0.5, 0, 1, 0)


def gltf_document(*, buffer_uri: str | None = None, extra: dict[str, object] | None = None) -> dict[str, object]:
    uri = buffer_uri or f"data:application/octet-stream;base64,{base64.b64encode(_POSITIONS).decode()}"
    document: dict[str, object] = {
        "asset": {"version": "2.0"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "translation": [5, 5, 5]}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3", "min": [0, 0, 0], "max": [2, 1, 0.5]}
        ],
        "bufferViews": [{"buffer": 0, "byteLength": len(_POSITIONS)}],
        "buffers": [{"byteLength": len(_POSITIONS), "uri": uri}],
    }
    return document | (extra or {})


def _chunk(kind: int, data: bytes, pad: bytes) -> bytes:
    data += pad * (-len(data) % 4)
    return struct.pack("<II", len(data), kind) + data


def glb(document: dict[str, object] | None = None) -> bytes:
    """A GLB file with the triangle in its binary chunk."""
    described = document or gltf_document()
    if document is None:
        buffers = described["buffers"]
        assert isinstance(buffers, list)
        buffers[0] = {"byteLength": len(_POSITIONS)}
    body = _chunk(0x4E4F534A, json.dumps(described).encode(), b" ") + _chunk(0x004E4942, _POSITIONS, b"\x00")
    return struct.pack("<4sII", b"glTF", 2, 12 + len(body)) + body


Point = tuple[float, float, float]


def _box(low: Point, high: Point, rows: int) -> tuple[list[Point], list[tuple[int, int, int]]]:
    """A box in OBJ axes (Y up) cut into `rows` bands along Y, so slices of it find surface everywhere."""
    vertices: list[Point] = []
    faces: list[tuple[int, int, int]] = []
    (x0, y0, z0), (x1, y1, z1) = low, high
    for row in range(rows + 1):
        y = y0 + (y1 - y0) * row / rows
        vertices += [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)]
    for row in range(rows):
        base = row * 4
        for side in range(4):
            a, b = base + side, base + (side + 1) % 4
            faces += [(a, b, b + 4), (a, b + 4, a + 4)]
    top = rows * 4
    faces += [(0, 2, 1), (0, 3, 2), (top, top + 1, top + 2), (top, top + 2, top + 3)]
    return vertices, faces


def _obj(boxes: list[tuple[Point, Point, int]], scale: float = 1.0) -> bytes:
    lines, offset = [], 1
    for low, high, rows in boxes:
        vertices, faces = _box(low, high, rows)
        lines += [f"v {x * scale:.4f} {y * scale:.4f} {z * scale:.4f}" for x, y, z in vertices]
        lines += [f"f {a + offset} {b + offset} {c + offset}" for a, b, c in faces]
        offset += len(vertices)
    return "\n".join(lines).encode()


def humanoid_obj(scale: float = 1.0) -> bytes:
    """A 1.7 m blocky person standing with arms down, as an OBJ file: legs apart, arms clear of the torso."""
    return _obj(
        [
            ((-0.16, 0.0, -0.06), (-0.04, 0.82, 0.06), 12),
            ((0.04, 0.0, -0.06), (0.16, 0.82, 0.06), 12),
            ((-0.17, 0.82, -0.09), (0.17, 1.45, 0.09), 8),
            ((-0.1, 1.47, -0.1), (0.1, 1.7, 0.1), 3),
            ((-0.29, 0.8, -0.05), (-0.21, 1.4, 0.05), 10),
            ((0.21, 0.8, -0.05), (0.29, 1.4, 0.05), 10),
        ],
        scale,
    )


def blob_obj() -> bytes:
    """A plain 1 m box with nothing that reads as legs."""
    return _obj([((-0.5, 0.0, -0.5), (0.5, 1.0, 0.5), 4)])
