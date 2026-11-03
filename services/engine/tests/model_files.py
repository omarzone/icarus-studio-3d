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
