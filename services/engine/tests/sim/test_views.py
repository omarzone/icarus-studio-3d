import struct
import zlib

import numpy as np
import pytest

from icarus.design.compiler import compile_project
from icarus.design.scene import scene_description
from icarus.library.templates import template_operations
from icarus.projects.operations import apply_operations, empty_project
from icarus.sim.views import CameraSpec, RenderUnavailable, ViewRenderer, encode_png


def decoded(png: bytes) -> np.ndarray:
    """Pixels of an 8-bit RGB PNG without filters, as encode_png writes it."""
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    width, height = struct.unpack(">II", png[16:24])
    data, offset = b"", 8
    while offset < len(png):
        (length,) = struct.unpack(">I", png[offset : offset + 4])
        tag = png[offset + 4 : offset + 8]
        if tag == b"IDAT":
            data += png[offset + 8 : offset + 8 + length]
        offset += 12 + length
    rows = np.frombuffer(zlib.decompress(data), dtype=np.uint8).reshape(height, 1 + width * 3)
    return rows[:, 1:].reshape(height, width, 3)


def test_encoded_pixels_decode_back_exactly():
    pixels = np.random.default_rng(0).integers(0, 256, size=(7, 5, 3), dtype=np.uint8)
    assert np.array_equal(decoded(encode_png(pixels)), pixels)


@pytest.fixture(scope="module")
def parking():
    project = apply_operations(empty_project("000000000000", "Parking"), template_operations("parking_car"))
    compiled = compile_project(project)
    return compiled, scene_description(compiled, 1).zones


@pytest.fixture(scope="module")
def renderer():
    views = ViewRenderer()
    yield views
    views.close()


def greenish(pixels: np.ndarray) -> int:
    red, green, blue = (pixels[..., channel].astype(int) for channel in range(3))
    return int(np.sum((green > red + 30) & (green > blue + 30)))


def test_a_top_view_of_the_goal_is_a_png_of_the_asked_size_with_the_goal_zone_drawn(parking, renderer):
    compiled, zones = parking
    goal = next(zone for zone in zones if zone.kind == "goal_zone")
    camera = CameraSpec(lookat=goal.position, distance=8.0, azimuth=90.0, elevation=-89.0, width=160, height=100)
    try:
        with_zones = renderer.render(compiled, camera, zones)
    except RenderUnavailable as error:
        pytest.skip(f"no offscreen OpenGL context: {error}")
    without = renderer.render(compiled, camera, [])
    pixels = decoded(with_zones)
    assert pixels.shape == (100, 160, 3)
    assert greenish(pixels) > greenish(decoded(without)) + 50
