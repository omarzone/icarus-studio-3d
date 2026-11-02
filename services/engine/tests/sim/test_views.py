import struct
import zlib

import numpy as np
import pytest

from icarus.design.compiler import compile_project
from icarus.design.scene import scene_description
from icarus.library.templates import template_operations
from icarus.projects.operations import apply_operations, empty_project
from icarus.sim.views import CameraSpec, ViewRenderer, encode_png, is_blank


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


@pytest.mark.needs_gl
def test_a_top_view_of_the_goal_is_a_png_of_the_asked_size_with_the_goal_zone_drawn(parking, renderer):
    compiled, zones = parking
    goal = next(zone for zone in zones if zone.kind == "goal_zone")
    camera = CameraSpec(lookat=goal.position, distance=8.0, azimuth=90.0, elevation=-89.0, width=160, height=100)
    with_zones = renderer.render(compiled, camera, zones)
    without = renderer.render(compiled, camera, [])
    pixels = decoded(with_zones)
    assert pixels.shape == (100, 160, 3)
    assert greenish(pixels) > greenish(decoded(without)) + 50


@pytest.mark.needs_gl
def test_renders_stay_visible_after_many_distinct_models_and_when_returning_to_the_first(renderer):
    models = [
        compile_project(apply_operations(empty_project("000000000000", template), template_operations(template)))
        for template in ("empty_world", "parking_car", "walker_robot", "humanoid", "walker_robot")
    ]
    camera = CameraSpec(lookat=(0.0, 0.0, 0.5), distance=4.0, azimuth=-135.0, elevation=-30.0, width=96, height=64)
    frames = [decoded(renderer.render(compiled, camera, [])) for compiled in models]
    frames.append(decoded(renderer.render(models[0], camera, [])))
    assert all(frame.std() > 1.0 and frame.max() > 20 for frame in frames)


@pytest.mark.needs_gl
def test_a_frame_of_one_color_is_blank_and_a_rendered_scene_is_not(parking, renderer):
    assert is_blank(np.zeros((40, 60, 3), np.uint8)) and is_blank(np.full((40, 60, 3), 200, np.uint8))
    compiled, zones = parking
    png = renderer.render(compiled, CameraSpec((0.0, 0.0, 0.5), 6.0, -135.0, -30.0, 96, 64), zones)
    assert not is_blank(decoded(png))
