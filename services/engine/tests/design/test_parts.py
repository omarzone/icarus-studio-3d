"""Parts built from scratch: wedge colliders, palette materials and the ground's marks."""

import mujoco
import numpy as np
import pytest

from icarus.contracts.operations import CreateObject, SetProperty
from icarus.contracts.properties import ChoiceValue, ListValue
from icarus.design.checks import design_report
from icarus.design.compiler import compile_project
from icarus.design.scene import scene_description
from icarus.design.surfaces import SURFACE_FRICTION
from icarus.library.look_properties import training_content
from icarus.library.materials import MATERIALS
from icarus.library.parts import Part, fixture, solid
from icarus.library.templates import template_operations
from icarus.projects.operations import apply_operations, empty_project


def _world(*parts: Part):
    project = apply_operations(empty_project("0123456789ab", "T"), template_operations("empty_world"))
    creates = [CreateObject(op="create_object", target="world", object=part.spec()) for part in parts]
    return apply_operations(project, creates)


def _set(project, obj: str, component: str, prop: str, value):
    return apply_operations(
        project, [SetProperty(op="set_property", object=obj, component=component, property=prop, value=value)]
    )


def _wedge(shape: str = "wedge", rotation=(0.0, 0.0, 0.0)) -> Part:
    return fixture("ramp", "Ramp", None, (0, 0, 0.5), shape, (2, 4, 1), "#a3a3a3", rotation=rotation)


def _settle(project, steps: int = 1500):
    compiled = compile_project(project)
    data = mujoco.MjData(compiled.model)
    for _ in range(steps):
        mujoco.mj_step(compiled.model, data)
    return compiled, data


def test_a_wedge_is_a_convex_mesh_collider_inside_its_box_that_a_falling_ball_rolls_down():
    ball = solid("ball", "Ball", None, (0, 0, 2), "sphere", (0.2, 0.2, 0.2), 1, "#d9534f")
    report, compiled = design_report(_world(_wedge(), ball))
    assert report.ok and compiled is not None
    geom = compiled.model.geom("ramp")
    assert int(geom.type[0]) == int(mujoco.mjtGeom.mjGEOM_MESH)
    _, data = _settle(_world(_wedge(), ball))
    position = data.body("ball").xpos
    # It landed on the slope over the middle and rolled off its low edge, toward +y.
    assert position[1] > 2
    assert position[2] == pytest.approx(0.1, abs=0.02)


def test_a_wedge_is_drawn_at_its_authored_pose_and_size_although_mujoco_recenters_its_mesh():
    compiled = compile_project(_world(_wedge(rotation=(0, 0, 90))))
    drawn = next(geom for geom in scene_description(compiled, 1).geoms if geom.name == "ramp")
    assert drawn.shape == "wedge"
    assert drawn.size == pytest.approx((2, 4, 1))
    assert drawn.position == pytest.approx((0, 0, 0.5))
    assert drawn.quaternion == pytest.approx((np.cos(np.pi / 4), 0, 0, np.sin(np.pi / 4)))


def _height_under(compiled, x: float, y: float) -> float:
    data = mujoco.MjData(compiled.model)
    mujoco.mj_forward(compiled.model, data)
    hit = np.zeros(1, dtype=np.int32)
    distance = mujoco.mj_ray(compiled.model, data, np.array([x, y, 5.0]), np.array([0, 0, -1.0]), None, 1, -1, hit)
    return 5.0 - distance


def test_a_corner_wedge_rises_from_its_far_edges_to_a_peak_over_its_plus_x_minus_y_corner():
    compiled = compile_project(_world(_wedge("corner_wedge")))
    model = compiled.model
    mesh = int(model.geom("ramp").dataid[0])
    assert int(model.mesh_vertnum[mesh]) == 5
    assert _height_under(compiled, 0.9, -1.8) == pytest.approx(0.95, abs=0.02)
    assert _height_under(compiled, 0.0, 0.0) == pytest.approx(0.5, abs=0.02)
    assert _height_under(compiled, -0.9, 1.8) == pytest.approx(0.05, abs=0.02)


def test_picking_a_palette_material_sets_the_surface_and_the_friction_physics_reads():
    project = _set(_world(_wedge()), "ramp", "material", "preset", ListValue(type="list", value="sand"))
    ramp = next(obj for obj in project.world.objects if obj.id == "ramp")
    material = next(item for item in ramp.components if item.kind == "material")
    assert material.properties["surface"] == ListValue(type="list", value="sand")
    friction = compile_project(project).model.geom("ramp").friction[0]
    assert friction == pytest.approx(MATERIALS["sand"].friction)


def test_every_palette_material_maps_onto_a_surface_with_a_friction():
    for preset in MATERIALS.values():
        assert preset.surface in SURFACE_FRICTION
        assert 0 < preset.friction <= 2


def test_ice_stays_slippery_under_grippy_tires_while_other_materials_keep_mujoco_s_rule():
    project = _set(_world(_wedge()), "ramp", "material", "preset", ListValue(type="list", value="ice"))
    compiled = compile_project(project)
    assert int(compiled.model.geom("ramp").priority[0]) == 1
    assert compiled.model.geom("ramp").friction[0] == pytest.approx(0.05)
    wood = compile_project(_set(project, "ramp", "material", "preset", ListValue(type="list", value="wood")))
    assert int(wood.model.geom("ramp").priority[0]) == 0


def test_the_palette_material_is_exported_for_drawing_and_old_parts_stay_custom():
    project = _set(_world(_wedge()), "ramp", "material", "preset", ListValue(type="list", value="neon"))
    geoms = {geom.name: geom for geom in scene_description(compile_project(project), 1).geoms}
    assert geoms["ramp"].material == "neon"
    assert geoms["ground"].material is None


def test_the_ground_takes_a_material_and_marks_and_the_marks_only_change_the_drawing():
    project = _set(_world(), "ground", "material", "preset", ListValue(type="list", value="grass"))
    marked = _set(project, "ground", "ground", "decal", ChoiceValue(type="choice", value="studs"))
    compiled = compile_project(marked)
    assert compiled.model.geom("ground").friction[0] == pytest.approx(MATERIALS["grass"].friction)
    floor = next(geom for geom in scene_description(compiled, 1).geoms if geom.name == "ground")
    assert (floor.material, floor.decal, floor.decal_cell) == ("grass", "studs", 1)
    assert training_content(marked) == training_content(project)
