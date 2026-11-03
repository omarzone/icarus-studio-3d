import json

import pytest

from icarus.projects.skin_files import MAX_SKIN_BYTES, SkinRejected, read_skin
from tests.model_files import glb, gltf_document


def test_a_glb_is_measured_on_the_engine_axes_with_its_node_transform():
    skin = read_skin(glb())
    # glTF is Y-up: its height (1) becomes the engine's Z and its depth (0.5) the engine's Y.
    assert (skin.format, skin.bounds, skin.triangles) == ("glb", (2.0, 0.5, 1.0), 1)


def test_a_rotated_and_scaled_node_changes_the_measured_bounds():
    # A quarter turn around glTF Y swaps width and depth; a scale of 2 doubles everything.
    node = {"mesh": 0, "rotation": [0, 0.7071068, 0, 0.7071068], "scale": [2, 2, 2]}
    skin = read_skin(json.dumps(gltf_document(extra={"nodes": [node]})).encode())
    assert skin.format == "gltf"
    assert skin.bounds == pytest.approx((1.0, 4.0, 2.0), abs=1e-5)


@pytest.mark.parametrize(
    "document",
    [
        gltf_document(buffer_uri="https://example.com/car.bin"),
        gltf_document(buffer_uri="car.bin"),
        gltf_document(extra={"images": [{"uri": "file:///etc/passwd"}]}),
        gltf_document(extra={"images": [{"name": "empty"}]}),
        gltf_document(extra={"extensionsUsed": ["KHR_draco_mesh_compression"]}),
        gltf_document(extra={"asset": {"version": "1.0"}}),
        gltf_document(extra={"accessors": [{"bufferView": 0, "componentType": 5126, "count": 3, "type": "VEC3"}]}),
        gltf_document(extra={"nodes": [{"children": [1]}, {"children": [0], "mesh": 0}]}),
        gltf_document(extra={"nodes": [{"mesh": 4}]}),
        gltf_document(extra={"nodes": []}),
    ],
    ids=[
        "network buffer",
        "sibling file buffer",
        "file texture",
        "texture without data",
        "draco",
        "glTF 1",
        "positions without bounds",
        "node loop",
        "missing mesh",
        "nothing to draw",
    ],
)
def test_models_that_reach_outside_themselves_or_cannot_be_measured_are_rejected(document):
    with pytest.raises(SkinRejected):
        read_skin(json.dumps(document).encode())


@pytest.mark.parametrize(
    "data",
    [
        b"MZ\x90\x00 not a model",
        glb()[:30],
        glb()[:-4],
        b'{"asset": {"version": "2.0"',
        b"glTF" + (1).to_bytes(4, "little") + (20).to_bytes(4, "little") + b"\x00" * 8,
        b"\x00" * (MAX_SKIN_BYTES + 1),
    ],
    ids=["not glTF", "cut short", "wrong length", "broken JSON", "GLB version 1", "too large"],
)
def test_malformed_and_oversized_files_are_rejected(data):
    with pytest.raises(SkinRejected):
        read_skin(data)
