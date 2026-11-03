"""The ground as a slab with edges and an editable size, and rounded box edges that only change the drawing."""

import mujoco
import pytest

from icarus.contracts.operations import AddComponent, CreateObject, SetProperty
from icarus.contracts.properties import SliderValue, VectorValue
from icarus.design.checks import design_report
from icarus.design.compiler import CompileError, compile_project
from icarus.design.scene import scene_description
from icarus.library.components import default_component
from icarus.library.look_properties import training_content
from icarus.library.parts import Part
from icarus.library.pieces import PIECES
from icarus.library.templates import template_operations
from icarus.projects.operations import apply_operations, empty_project
from icarus.projects.validation import validate_project


def _empty():
    return apply_operations(empty_project("0123456789ab", "T"), template_operations("empty_world"))


def _ground_size(project, size):
    value = VectorValue(type="vector", value=size)
    operation = SetProperty(op="set_property", object="ground", component="ground", property="size", value=value)
    return apply_operations(project, [operation])


def test_a_new_world_stands_on_a_slab_whose_top_is_the_ground_level():
    compiled = compile_project(_empty())
    geom = compiled.model.geom("ground")
    assert int(geom.type[0]) == int(mujoco.mjtGeom.mjGEOM_BOX)
    data = mujoco.MjData(compiled.model)
    mujoco.mj_forward(compiled.model, data)
    top = float(data.geom_xpos[geom.id, 2] + compiled.model.geom_size[geom.id, 2])
    assert top == pytest.approx(0.0)
    assert compiled.grounds == frozenset({"ground"})


def test_editing_the_ground_size_resizes_the_slab_physics_and_drawing_alike_with_its_top_kept():
    project = _ground_size(_empty(), (20, 8, 2))
    report, compiled = design_report(project)
    assert report.ok and compiled is not None
    assert list(compiled.model.geom("ground").size) == pytest.approx([10, 4, 1])
    floor = next(geom for geom in scene_description(compiled, 1).geoms if geom.name == "ground")
    assert floor.ground and floor.shape == "box"
    assert floor.size == pytest.approx((20, 8, 2))
    assert floor.position[2] == pytest.approx(-1.0)


def test_an_old_plane_becomes_a_slab_by_adding_the_ground_component():
    plane = Part(
        "floor",
        "Floor",
        None,
        {"transform": {}, "mesh": {"shape": "plane", "size": (40, 40, 0.1)}, "physics_body": {"mode": "static"}},
    )
    project = apply_operations(
        empty_project("0123456789ab", "T"), [CreateObject(op="create_object", target="world", object=plane.spec())]
    )
    assert int(compile_project(project).model.geom("floor").type[0]) == int(mujoco.mjtGeom.mjGEOM_PLANE)
    component = default_component("ground", "ground")
    slab = apply_operations(project, [AddComponent(op="add_component", object="floor", component=component)])
    assert int(compile_project(slab).model.geom("floor").type[0]) == int(mujoco.mjtGeom.mjGEOM_BOX)


def test_the_ground_belongs_to_the_world_and_never_moves():
    project = _empty()
    moving = project.model_copy(deep=True)
    physics = next(item for item in moving.world.objects[0].components if item.kind == "physics_body")
    physics.properties["mode"] = physics.properties["mode"].model_copy(update={"value": "dynamic"})
    with pytest.raises(CompileError, match="only be static"):
        compile_project(moving)
    walker = apply_operations(empty_project("0123456789ab", "T"), template_operations("walker_robot"))
    component = default_component("ground", "ground")
    root = next(obj for obj in walker.bodies[0].objects if obj.parent is None)
    carried = apply_operations(walker, [AddComponent(op="add_component", object=root.id, component=component)])
    assert validate_project(walker) == []
    assert [issue.message for issue in validate_project(carried)] == [
        f"{root.name} is part of a body; a ground belongs to the world"
    ]


def test_rounded_edges_are_drawn_on_boxes_only_and_change_neither_the_collider_nor_what_a_brain_trained_on():
    block = PIECES["block"].object
    project = apply_operations(_empty(), [CreateObject(op="create_object", target="world", object=block)])
    sphere = PIECES["sphere"].object
    project = apply_operations(project, [CreateObject(op="create_object", target="world", object=sphere)])
    sharp = apply_operations(
        project,
        [
            SetProperty(
                op="set_property",
                object="block",
                component="material",
                property="bevel",
                value=SliderValue(type="slider", value=0),
            )
        ],
    )
    compiled, sharp_compiled = compile_project(project), compile_project(sharp)
    geoms = {geom.name: geom for geom in scene_description(compiled, 1).geoms}
    assert geoms["block"].bevel == pytest.approx(0.04) and geoms["block"].finish == "blocks"
    assert geoms["sphere"].bevel == 0 and geoms["sphere"].shape == "sphere"
    assert list(compiled.model.geom("block").size) == list(sharp_compiled.model.geom("block").size)
    assert training_content(project) == training_content(sharp)
