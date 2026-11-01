import math

import pytest

from icarus.design.compiler import compile_project
from icarus.design.scene import scene_description
from icarus.library.templates import template_operations
from icarus.projects.operations import apply_operations, empty_project


@pytest.fixture(scope="module")
def car_scene():
    project = apply_operations(empty_project("0123456789ab", "T"), template_operations("parking_car"))
    return scene_description(compile_project(project), revision=1)


def test_the_car_scene_has_the_chassis_and_four_cylinder_wheels(car_scene):
    geoms = {geom.name: geom for geom in car_scene.geoms}
    assert geoms["car"].shape == "box"
    wheels = [geom for name, geom in geoms.items() if name.startswith("wheel_")]
    assert len(wheels) == 4
    for wheel in wheels:
        assert wheel.shape == "cylinder"
        assert wheel.position[2] == pytest.approx(0.3, abs=1e-3)
        assert wheel.size[0] == pytest.approx(0.6)


def test_every_quaternion_is_a_unit_quaternion(car_scene):
    for item in [*car_scene.bodies, *car_scene.geoms]:
        assert math.sqrt(sum(value * value for value in item.quaternion)) == pytest.approx(1)


def test_colors_come_from_the_materials(car_scene):
    geoms = {geom.name: geom for geom in car_scene.geoms}
    assert geoms["car"].color == "#c8553d"
    assert car_scene.revision == 1
    assert car_scene.lights


def test_the_scene_shows_where_the_car_starts_and_where_it_must_park(car_scene):
    project = apply_operations(empty_project("0123456789ab", "T"), template_operations("parking_car"))
    objects = {obj.id: obj for obj in [*project.world.objects, *(o for body in project.bodies for o in body.objects)]}
    zones = {zone.kind: zone for zone in car_scene.zones}
    assert set(zones) == {"spawn_point", "goal_zone"}
    goal = zones["goal_zone"]
    goal_object = objects[goal.object]
    goal_position = next(c for c in goal_object.components if c.kind == "transform").properties["position"].model_dump()["value"]
    radius = next(c for c in goal_object.components if c.kind == "goal_zone").properties["radius"].model_dump()["value"]
    assert goal.shape == "sphere"
    assert goal.position == pytest.approx(goal_position)
    assert goal.size == pytest.approx((2 * radius, 2 * radius, 2 * radius))
    assert all(geom.name != goal.name for geom in car_scene.geoms)
