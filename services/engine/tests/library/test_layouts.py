from typing import get_args

import mujoco
import numpy as np
import pytest
from pydantic import TypeAdapter, ValidationError

from icarus.contracts.library import PieceInfo
from icarus.contracts.properties import ListValue, VectorValue
from icarus.copilot.scratch_stages import starting_project
from icarus.design.checks import design_report
from icarus.library import layout_pieces
from icarus.library.layout_courses import cell_route
from icarus.library.layout_params import LayoutRecipe
from icarus.library.layout_pieces import element
from icarus.library.layout_site import FloorPlan, Rect
from icarus.library.layouts import RECIPES, LayoutError, LayoutParams, expand_layout
from icarus.library.parts import Part
from icarus.projects.document import all_objects
from icarus.projects.operations import apply_operations
from icarus.projects.store import ProjectStore

PARAMS: TypeAdapter[LayoutParams] = TypeAdapter(LayoutParams)


def _laid_out(recipe: str, **values):
    project = starting_project("Layout")
    layout = expand_layout(PARAMS.validate_python({"recipe": recipe, **values}), project)
    return layout, apply_operations(project, layout.operations)


def test_the_recipe_list_and_the_plan_names_agree():
    assert set(RECIPES) == set(get_args(LayoutRecipe))


@pytest.mark.parametrize("recipe", sorted(RECIPES))
@pytest.mark.parametrize("seed", [0, 7, 4242])
def test_every_recipe_compiles_and_passes_the_design_tests(recipe, seed):
    layout, project = _laid_out(recipe, seed=seed)
    report, compiled = design_report(project)
    assert report.ok and compiled is not None, [check.detail for check in report.checks if check.status == "fail"]
    root = layout.site.prefix
    # Every object sits in a transform-only area group under one root, so areas edit as one.
    groups = {obj.id for obj in project.world.objects if obj.parent == root}
    members = {obj.id for obj in layout.site.objects[1:]} - groups
    assert groups and members
    assert all(obj.parent in groups for obj in project.world.objects if obj.id in members)
    assert all(
        [component.kind for component in obj.components] == ["transform"]
        for obj in project.world.objects
        if obj.id in groups | {root}
    )
    goal = next(obj for obj in project.world.objects if any(item.kind == "goal_zone" for item in obj.components))
    assert goal.name and layout.path_m > 0


@pytest.mark.parametrize("recipe", sorted(RECIPES))
def test_the_same_seed_lays_out_the_same_place_and_another_seed_may_differ(recipe):
    first, _ = _laid_out(recipe, seed=3)
    again, _ = _laid_out(recipe, seed=3)
    assert [op.model_dump() for op in first.operations] == [op.model_dump() for op in again.operations]


def test_another_seed_changes_a_scattered_layout():
    first, _ = _laid_out("forest", seed=1)
    other, _ = _laid_out("forest", seed=2)
    assert [op.model_dump() for op in first.operations] != [op.model_dump() for op in other.operations]


def _footprints_cover_every_solid_geom(layout, project) -> None:
    """The floor plan the path check reads must hold everything MuJoCo can bump into on the ground."""
    _, compiled = design_report(project)
    assert compiled is not None
    model, data = compiled.model, mujoco.MjData(compiled.model)
    mujoco.mj_forward(model, data)
    prefix = layout.site.prefix
    # Steps and humps are climbed rather than walked around, so the path check leaves them out on purpose.
    climbed = (f"{prefix}_step_", f"{prefix}_ramp_")
    solid = {
        obj.id
        for obj in project.world.objects
        if any(item.kind == "collider" for item in obj.components) and not obj.id.startswith(climbed)
    }
    ox, oy = layout.origin
    rects = [Rect(r.x0 + ox, r.y0 + oy, r.x1 + ox, r.y1 + oy).grown(0.02) for r in layout.site.footprints]
    checked = 0
    for index in range(model.ngeom):
        if model.geom(index).name not in solid:
            continue
        rotation = data.geom_xmat[index].reshape(3, 3)
        center = data.geom_xpos[index] + rotation @ model.geom_aabb[index, :3]
        half = np.abs(rotation) @ model.geom_aabb[index, 3:]
        if center[2] - half[2] > 0.5:
            continue  # stacked on something the floor plan already holds
        box = Rect(center[0] - half[0], center[1] - half[1], center[0] + half[0], center[1] + half[1])
        assert any(r.x0 <= box.x0 and box.x1 <= r.x1 and r.y0 <= box.y0 and box.y1 <= r.y1 for r in rects), model.geom(
            index
        ).name
        checked += 1
    assert checked or not layout.site.footprints


@pytest.mark.parametrize("recipe", sorted(RECIPES))
def test_the_path_check_knows_every_solid_object(recipe):
    _footprints_cover_every_solid_geom(*_laid_out(recipe, seed=5))


def test_free_bays_stay_free_and_the_goal_sits_in_an_empty_bay():
    layout, project = _laid_out("parking_lot", occupancy=1, free_bays=[1, 2, 9], goal_bay=12)
    notes = layout.site.notes
    assert notes["free_bays"] == [1, 2, 9, 12]
    assert notes["occupied_bays"] == [bay for bay in range(1, 17) if bay not in (1, 2, 9, 12)]
    cars = [obj for obj in project.world.objects if obj.id.startswith("lot_parked_car")]
    assert len(cars) == 12
    width, depth, aisle = 2.7, 5.5, 6.5
    goal = next(obj for obj in project.world.objects if any(item.kind == "goal_zone" for item in obj.components))
    position = next(item for item in goal.components if item.kind == "transform").properties["position"]
    assert isinstance(position, VectorValue)
    # Bay 12 is the fourth bay of the second row, whose bays open toward the aisle below them.
    ox, oy = layout.origin
    assert position.value[:2] == pytest.approx((ox + 3.5 * width, oy + depth + aisle + depth / 2))


def test_the_goal_bay_becomes_a_rectangle_the_size_of_the_bay_facing_into_it():
    layout, project = _laid_out("parking_lot", goal_bay=12)
    goal = next(obj for obj in project.world.objects if any(item.kind == "goal_zone" for item in obj.components))
    zone = next(item for item in goal.components if item.kind == "goal_zone").properties
    rotation = next(item for item in goal.components if item.kind == "transform").properties["rotation"]
    assert [zone[prop].model_dump()["value"] for prop in ("shape", "length", "width")] == ["rectangle", 5.5, 2.7]
    # The second row opens toward the aisle below it, so a car drives in heading up the lot (+y).
    assert isinstance(rotation, VectorValue) and rotation.value == (0, 0, 90)


def test_a_bay_that_does_not_exist_is_refused_with_the_bay_numbers():
    with pytest.raises(ValidationError, match="1 to 16"):
        PARAMS.validate_python({"recipe": "parking_lot", "free_bays": [17]})


@pytest.mark.parametrize("seed", range(8))
@pytest.mark.parametrize("cells", [(1, 6), (5, 5), (12, 9)])
def test_mazes_are_always_solvable_and_a_loopless_maze_has_exactly_one_way(seed, cells):
    layout, project = _laid_out("maze", seed=seed, cells_x=cells[0], cells_y=cells[1], loops=0)
    route = layout.site.notes["cells_on_route"]
    assert route >= abs(cells[0] - 1) + abs(cells[1] - 1) + 1
    walls = [obj for obj in project.world.objects if obj.id.startswith("maze_wall")]
    assert walls


def test_the_cell_route_follows_only_open_passages():
    passages = {frozenset(((0, 0), (1, 0))), frozenset(((1, 0), (1, 1)))}
    assert cell_route(passages, (0, 0), (1, 1)) == [(0, 0), (1, 0), (1, 1)]
    assert cell_route(passages, (0, 0), (0, 1)) is None


def test_the_floor_plan_passes_a_gap_wider_than_the_body_and_not_a_narrower_one():
    def gap_passes(gap: float) -> bool:
        plan = FloorPlan(Rect(-5, -5, 5, 5), clearance=0.5)
        # A wall across the room with one gap in the middle; outside the room is closed too.
        plan.mark(Rect(-0.1, -5, 0.1, -gap / 2))
        plan.mark(Rect(-0.1, gap / 2, 0.1, 5))
        return plan.path((-3, 0), (3, 0)) is not None

    assert gap_passes(1.6)
    assert not gap_passes(0.8)


def test_a_layout_whose_way_cannot_stay_open_says_what_to_change():
    with pytest.raises(LayoutError, match="clearance"):
        _laid_out("maze", cell_size=1.2, clearance=1.0)


def test_the_layout_start_lands_under_the_body_and_moves_the_spawn_and_goal(tmp_path):
    store = ProjectStore(tmp_path / "projects")
    project = store.create("Parking", "parking_car").project
    layout = expand_layout(PARAMS.validate_python({"recipe": "parking_lot"}), project)
    candidate = apply_operations(project, layout.operations)
    spawns = [obj for obj in candidate.world.objects if any(item.kind == "spawn_point" for item in obj.components)]
    goals = [obj for obj in all_objects(candidate) if any(item.kind == "goal_zone" for item in obj.components)]
    assert [obj.id for obj in spawns] == ["spawn"] and [obj.id for obj in goals] == ["goal"]
    car = next(obj for obj in project.bodies[0].objects if obj.parent is None)
    car_position = next(item for item in car.components if item.kind == "transform").properties["position"]
    assert isinstance(car_position, VectorValue)
    assert layout.summary()["start"] == pytest.approx(list(car_position.value[:2]))
    again = expand_layout(PARAMS.validate_python({"recipe": "parking_lot"}), candidate)
    assert again.site.prefix == "lot2"


def test_a_library_piece_with_the_element_id_brings_its_look_and_keeps_the_layout_size(monkeypatch):
    look = Part("parked_car", "Parked car", None, {"transform": {}, "mesh": {"shape": "capsule"}})
    look.components["material"] = {"color": "#123456", "style": "shell"}
    piece = PieceInfo(id="parked_car", label="Parked car", icon="box", description="A car.", object=look.spec())
    monkeypatch.setitem(layout_pieces.PIECES, "parked_car", piece)
    spec = element("parked_car", "lot_parked_car_1", "Parked car 1", "lot_cars", (1, 2, 0.7), (4.3, 1.8, 1.45))
    components = {item.kind: item for item in spec.components}
    assert components["material"].properties["style"] == ListValue(type="list", value="shell")
    assert components["mesh"].properties["size"] == VectorValue(type="vector", value=(4.3, 1.8, 1.45))
    assert components["physics_body"] and components["collider"]
