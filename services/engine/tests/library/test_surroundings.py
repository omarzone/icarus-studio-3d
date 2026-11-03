import mujoco
import numpy as np
import pytest
from pydantic import TypeAdapter

from icarus.contracts.operations import AddComponent, CreateObject, SetProperty
from icarus.contracts.properties import VectorValue
from icarus.copilot.scratch_stages import starting_project
from icarus.design.compiler import compile_project
from icarus.design.scene import scene_description
from icarus.library.components import default_component
from icarus.library.layout_site import Rect, uncovered
from icarus.library.layouts import LayoutParams, expand_layout
from icarus.library.look_properties import training_content
from icarus.library.pieces import PIECES
from icarus.library.templates import template_operations
from icarus.projects.operations import apply_operations, empty_project

PARAMS: TypeAdapter[LayoutParams] = TypeAdapter(LayoutParams)


def _placed(piece: str):
    world = apply_operations(empty_project("0123456789ab", "T"), template_operations("empty_world"))
    return apply_operations(world, [CreateObject(op="create_object", target="world", object=PIECES[piece].object)])


@pytest.mark.parametrize("piece", ["tree", "pine_tree", "street_light", "barrier_gate", "parking_sign", "planter"])
def test_an_ornament_is_drawn_on_its_part_and_never_compiled(piece):
    compiled = compile_project(_placed(piece))
    model = compiled.model
    names = [model.geom(index).name for index in range(model.ngeom)]
    # The piece compiles to its own collider and nothing else: no geom, site or body for the ornament.
    assert names.count(piece) == 1 and not any(name.startswith(f"{piece}:") for name in names)
    geom = next(item for item in scene_description(compiled, 0).geoms if item.name == piece)
    assert len(geom.ornaments) == 1
    ornament = geom.ornaments[0]
    # Drawn bigger than the collider in at least one direction: that is what an ornament is for.
    reach = [abs(offset) + size / 2 for offset, size in zip(ornament.offset, ornament.size, strict=True)]
    assert any(far > half + 0.01 for far, half in zip(reach, [value / 2 for value in geom.size], strict=True))


def test_a_tree_crown_sits_on_top_of_its_trunk_and_reaches_past_it():
    geom = next(item for item in scene_description(compile_project(_placed("tree")), 0).geoms if item.name == "tree")
    crown = geom.ornaments[0]
    trunk_top = geom.position[2] + geom.size[2] / 2
    crown_bottom = geom.position[2] + crown.offset[2] - crown.size[2] / 2
    assert crown_bottom < trunk_top < geom.position[2] + crown.offset[2] + crown.size[2] / 2
    assert crown.size[0] > 5 * geom.size[0]


def test_ornaments_never_change_what_a_brain_learned_nor_what_rays_see():
    project = _placed("tree")
    crown = SetProperty(
        op="set_property",
        object="tree",
        component="ornament",
        property="size",
        value=VectorValue(type="vector", value=(8, 8, 6)),
    )
    another = AddComponent(op="add_component", object="tree", component=default_component("ornament", "extra"))
    changed = apply_operations(project, [crown, another])
    assert training_content(changed) == training_content(project)
    before, after = compile_project(project).model, compile_project(changed).model
    assert (before.ngeom, before.nsite, before.nbody) == (after.ngeom, after.nsite, after.nbody)
    data = mujoco.MjData(after)
    mujoco.mj_forward(after, data)
    # A ray through where the crown is drawn hits nothing.
    found = np.array([-1], dtype=np.int32)
    hit = mujoco.mj_ray(after, data, np.array([0.0, 0.0, 4.5]), np.array([1.0, 0.0, 0.0]), None, 1, -1, found)
    assert hit == -1 and found[0] == -1
    assert len(scene_description(compile_project(changed), 0).geoms[-1].ornaments) == 2


def test_uncovered_ground_fills_around_holes_without_overlaps():
    outer = Rect(0, 0, 10, 10)
    holes = [Rect(2, 2, 5, 5), Rect(4, 4, 8, 6), Rect(-1, 8, 3, 12)]
    pieces = uncovered(outer, holes)
    area = sum((p.x1 - p.x0) * (p.y1 - p.y0) for p in pieces)
    # 100 minus the holes' union: 9 + 8 - 1 overlap, and the 3 by 2 corner of the third inside the outer square.
    assert area == pytest.approx(100 - 16 - 6)
    assert not any(a.overlaps(b) for i, a in enumerate(pieces) for b in pieces[i + 1 :])
    assert not any(p.overlaps(h) for p in pieces for h in holes)


def _lot(**values):
    project = starting_project("Lot")
    layout = expand_layout(PARAMS.validate_python({"recipe": "parking_lot", **values}), project)
    return layout, apply_operations(project, layout.operations)


def _rects(layout, ids: set[str]) -> dict[str, Rect]:
    """Object id → footprint in the layout's frame, from each object's place under its group."""
    site = layout.site
    groups = {obj.id: obj for obj in site.objects}
    rects: dict[str, Rect] = {}
    for obj in site.objects:
        if obj.id not in ids:
            continue
        position = next(item for item in obj.components if item.kind == "transform").properties["position"]
        size = next(item for item in obj.components if item.kind == "mesh").properties["size"]
        parent = next(item for item in groups[obj.parent or ""].components if item.kind == "transform")
        offset = parent.properties["position"]
        assert isinstance(position, VectorValue) and isinstance(size, VectorValue) and isinstance(offset, VectorValue)
        rotation = next(item for item in obj.components if item.kind == "transform").properties.get("rotation")
        yaw = rotation.value[2] if isinstance(rotation, VectorValue) else 0
        center = (offset.value[0] + position.value[0], offset.value[1] + position.value[1])
        rects[obj.id] = Rect.around(center, size.value[0], size.value[1], yaw)
    return rects


def test_a_lot_comes_with_its_surroundings_and_they_keep_off_the_driving_path():
    layout, project = _lot(seed=4)
    names = {obj.name for obj in project.world.objects if obj.parent == "lot"}
    assert {"Sidewalks", "Streets", "Ground", "Trees", "Entry gates", "Road paint", "Street furniture"} <= names
    assert layout.summary()["surroundings"][:3] == ["sidewalks", "west street", "south street"]
    kinds = {obj.id.removeprefix("lot_").rstrip("_0123456789") for obj in layout.site.objects}
    assert {"barrier_gate", "crosswalk", "lane_dashes", "parking_mark", "street_light", "tree"} <= kinds
    assert kinds & {"pickup", "suv", "hatchback"}
    solid = {obj.id for obj in layout.site.objects if any(item.kind == "collider" for item in obj.components)}
    drives = {obj.id for obj in layout.site.objects if obj.name in ("Lot surface", "Entry lane surface")}
    paved = list(_rects(layout, drives).values())
    aisle_y = layout.site.start[1]
    lane = next(rect for rect in paved if rect.x1 <= 0)
    # Nothing solid stands on the entry lane or the aisle that every bay opens onto.
    aisle = Rect(0, aisle_y - 3.2, paved[0].x1, aisle_y + 3.2)
    for object_id, rect in _rects(layout, solid).items():
        assert not rect.overlaps(lane.grown(-0.05)), object_id
        assert not rect.overlaps(aisle), object_id
    # Ground patches lie edge to edge around the paving, never on it.
    ground = _rects(layout, {obj.id for obj in layout.site.objects if obj.name.startswith("Ground ")})
    assert ground and not any(rect.overlaps(other.grown(-0.01)) for rect in ground.values() for other in paved)
    goal = layout.site.goal
    assert goal is not None and layout.path_m > abs(goal[0] - layout.site.start[0])


def test_surroundings_off_lays_out_the_bare_lot_with_the_same_start_goal_and_bays():
    bare, project = _lot(seed=4, surroundings=False, vehicles="cars")
    full, _ = _lot(seed=4)
    names = {obj.name for obj in project.world.objects if obj.parent == "lot"}
    assert not names & {"Sidewalks", "Streets", "Ground", "Entry gates", "Road paint"}
    assert (bare.site.start, bare.site.goal, bare.site.goal_spot) == (
        full.site.start,
        full.site.goal,
        full.site.goal_spot,
    )
    assert bare.site.notes["occupied_bays"] == full.site.notes["occupied_bays"]
    assert all(obj.id.startswith("lot_parked_car") for obj in project.world.objects if obj.parent == "lot_cars")


def test_city_blocks_have_dashed_lines_crossings_and_furniture():
    project = starting_project("City")
    layout = expand_layout(PARAMS.validate_python({"recipe": "city_block", "blocks_x": 2, "blocks_y": 1}), project)
    kinds = [obj.id.removeprefix("city_").rstrip("_0123456789") for obj in layout.site.objects]
    # Center lines between each pair of intersections: 2 rows of 2 east-west and 3 columns of 1 north-south.
    assert kinds.count("lane_dashes") == 7
    # Crossings east of 2 by 2 intersections and north of 3 by 1.
    assert kinds.count("crosswalk") == 2 * 2 + 3 * 1
    assert {"street_light", "trash_bin", "fire_hydrant"} <= set(kinds)
    trees = [obj for obj in layout.site.objects if obj.id.startswith("city_tree")]
    assert trees and all(any(item.kind == "ornament" for item in obj.components) for obj in trees)
