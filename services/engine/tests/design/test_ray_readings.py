import math

import mujoco
import numpy as np
import pytest

from icarus.contracts.objects import ComponentSpec
from icarus.contracts.properties import CountValue, NumberValue, TextValue
from icarus.design.compiler import compile_project
from icarus.design.ray_readings import ray_readings
from icarus.design.scene import scene_description
from icarus.library.templates import template_operations
from icarus.projects.operations import apply_operations, empty_project
from tests.design.test_compiler import box, part, project_of


def one_ray(range_m: float) -> dict[str, dict]:
    return {"count": {"type": "count", "value": 1}, "range": {"type": "number", "value": range_m}}


def wall_at(x: float, id: str = "wall"):
    return part(
        id,
        None,
        transform={"position": {"type": "vector", "value": [x, 0, 1]}},
        mesh={"size": {"type": "vector", "value": [0.2, 2, 2]}},
        collider={},
    )


def rest(project):
    compiled = compile_project(project)
    data = mujoco.MjData(compiled.model)
    mujoco.mj_forward(compiled.model, data)
    return compiled.model, data


def test_a_ray_reads_the_distance_mujoco_measured_to_the_wall_it_looks_at():
    model, data = rest(project_of(box(distance_ray=one_ray(5)), wall_at(3)))
    [ray] = ray_readings(model, data, {"box:ray0": "Box distance 1"})
    assert (ray.sensor, ray.label, ray.range) == ("box:ray0", "Box distance 1", 5)
    assert ray.origin == pytest.approx((0, 0, 1))
    assert ray.direction == pytest.approx((1, 0, 0))
    assert ray.distance == pytest.approx(2.9, abs=1e-3)
    assert ray.distance == pytest.approx(float(data.sensordata[model.sensor("box:ray0").adr[0]]))


def test_a_ray_with_nothing_within_range_has_no_distance_and_looks_along_its_site():
    model, data = rest(project_of(box(distance_ray=one_ray(2)), wall_at(3)))
    [ray] = ray_readings(model, data)
    assert ray.distance is None and ray.range == 2
    assert ray.label == "Distance 1"
    site = model.site("box:ray0").id
    assert ray.direction == pytest.approx(tuple(data.site_xmat[site].reshape(3, 3)[:, 2]))
    assert np.linalg.norm(ray.direction) == pytest.approx(1)


def test_a_part_with_a_named_fan_and_a_rear_ray_reads_each_wall_under_its_own_name():
    sensed = box(
        distance_ray={**one_ray(5), "count": {"type": "count", "value": 3}, "name": {"type": "text", "value": "Front"}}
    )
    rear = ComponentSpec(id="rear", kind="distance_ray", properties={"heading": NumberValue(type="number", value=180)})
    rear.properties |= {"name": TextValue(type="text", value="Rear"), "count": CountValue(type="count", value=1)}
    sensed.components.append(rear)
    compiled = compile_project(project_of(sensed, wall_at(3), wall_at(-2, "back_wall")))
    data = mujoco.MjData(compiled.model)
    mujoco.mj_forward(compiled.model, data)
    rays = scene_description(compiled, revision=1, live=data).rays
    assert [(ray.sensor, ray.label) for ray in rays] == [
        ("box:ray0", "Front 30° right"),
        ("box:ray1", "Front ahead"),
        ("box:ray2", "Front 30° left"),
        ("box:rear:ray0", "Rear"),
    ]
    assert rays[1].distance == pytest.approx(2.9, abs=1e-3)
    assert rays[3].direction == pytest.approx((-1, 0, 0), abs=1e-6)
    assert rays[3].distance == pytest.approx(1.9, abs=1e-3)


def test_a_ray_saved_before_rays_had_names_and_headings_looks_ahead_under_its_part_name():
    sensed = box()
    sensed.components.append(ComponentSpec(id="distance_ray", kind="distance_ray", properties={}))
    compiled = compile_project(project_of(sensed))
    assert list(compiled.ray_labels.values()) == [
        "Box distance 30° right",
        "Box distance 15° right",
        "Box distance ahead",
        "Box distance 15° left",
        "Box distance 30° left",
    ]


def test_the_editor_scene_shows_the_car_rays_all_around_at_rest():
    project = apply_operations(empty_project("0123456789ab", "T"), template_operations("parking_car"))
    scene = scene_description(compile_project(project), revision=1)
    assert [ray.sensor for ray in scene.rays] == [f"car:ray{index}" for index in range(16)]
    assert all(ray.range == 10 for ray in scene.rays)
    headings = [round(math.degrees(math.atan2(ray.direction[1], ray.direction[0]))) for ray in scene.rays]
    assert headings[0] == 0 and 180 in {abs(heading) for heading in headings}
