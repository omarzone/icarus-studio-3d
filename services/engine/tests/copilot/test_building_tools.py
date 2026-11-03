import json
import math

import numpy as np
import pytest

from icarus.contracts.operations import CreateObject, EditOperation, OperationBatch, SetProperty
from icarus.copilot.agent.tools.base import ToolServices, TurnScope
from icarus.copilot.agent.tools.building import (
    GroupArgs,
    MatchingArgs,
    PatternArgs,
    group,
    matching_edit,
    pattern,
)
from icarus.copilot.agent.tools.finding import FindArgs, find_objects
from icarus.copilot.agent.tools.proposing import ProposeArgs, propose
from icarus.copilot.agent.tools.trying import TryArgs, try_change
from icarus.copilot.building.frames import rotation_degrees, rotation_matrix
from icarus.library.parts import Part
from icarus.projects.operations import apply_operations
from icarus.projects.store import ProjectStore
from icarus.training.run_store import RunStore

SOLID = {"collider": {}}


def _box(id: str, parent: str | None, position, size, color: str, rotation=(0, 0, 0)) -> Part:
    return Part(
        id,
        id.replace("_", " ").title(),
        parent,
        {
            "transform": {"position": position, "rotation": rotation},
            "mesh": {"shape": "box", "size": size},
            "material": {"color": color},
            **SOLID,
        },
    )


def _scene_parts() -> list[Part]:
    return [
        _box("pillar", None, (5, 0, 1), (0.5, 0.5, 2), "#aa3333"),
        Part("table", "Table", None, {"transform": {"position": (0, 5, 0), "rotation": (0, 0, 30)}}),
        _box("table_top", "table", (0, 0, 0.8), (1, 1, 0.1), "#8b5a2b"),
        _box("table_leg", "table", (0.4, 0.4, 0.4), (0.1, 0.1, 0.8), "#8b5a2b"),
    ]


@pytest.fixture
def scope(tmp_path) -> TurnScope:
    store = ProjectStore(tmp_path / "projects")
    project_id = store.create("Scene", "empty_world").project.id
    operations: list[EditOperation] = [
        CreateObject(op="create_object", target="world", object=part.spec()) for part in _scene_parts()
    ]
    store.apply(project_id, OperationBatch(operations=operations, summary="props"))
    services = ToolServices(store, RunStore(tmp_path / "runs"), None, None, None)  # type: ignore[arg-type]
    return TurnScope(project_id, store.state(project_id), "ask", services)


def _found(scope: TurnScope, **args) -> dict:
    observation = find_objects(scope, FindArgs.model_validate(args))
    assert observation.ok, observation.text
    return json.loads(observation.text.splitlines()[0])


def _tried(scope: TurnScope, observation) -> dict:
    assert observation.ok, observation.text
    lines = observation.text.splitlines()
    return json.loads(lines[1])


def _candidate(scope: TurnScope, try_id: str):
    return apply_operations(scope.state.project, scope.tries[try_id].operations)


def _transform(project, object_id: str) -> dict:
    obj = next(item for item in project.world.objects if item.id == object_id)
    component = next(item for item in obj.components if item.kind == "transform")
    return {key: tuple(value.model_dump()["value"]) for key, value in component.properties.items()}


def test_find_objects_filters_by_text_kind_color_region_and_near_with_world_frame_boxes(scope):
    groups = _found(scope, filter={"kinds": ["group"]})
    assert [row["id"] for row in groups["rows"]] == ["table"]
    # A group has no shape of its own, so its box is what it holds; the top sits 0.8 m up.
    assert groups["rows"][0]["position"][2] == pytest.approx(0.425, abs=0.01)
    brown = _found(scope, filter={"color": "#8a5b2c"}, fields=["id"])
    assert brown["rows"] == [{"id": "table_top"}, {"id": "table_leg"}]
    tall = _found(scope, filter={"region": {"min": [4, -1, 0], "max": [6, 1, 3]}}, fields=["id", "size"])
    assert tall["rows"] == [{"id": "pillar", "size": [0.5, 0.5, 2.0]}]
    near = _found(scope, filter={"near": {"point": [0, 5, 0], "radius_m": 1.5}, "inside": "table"}, fields=["id"])
    assert {row["id"] for row in near["rows"]} == {"table_top", "table_leg"}
    assert _found(scope, filter={"text": "PILL"}, fields=["id"])["rows"] == [{"id": "pillar"}]


def test_find_objects_pages_with_offset_and_says_where_the_next_page_starts(scope):
    first = _found(scope, limit=2, fields=["id"])
    second = _found(scope, limit=2, offset=first["next_offset"], fields=["id"])
    assert first["total"] == second["total"] == 8
    assert len(first["rows"]) == 2 and first["next_offset"] == 2
    assert not {row["id"] for row in first["rows"]} & {row["id"] for row in second["rows"]}


def test_a_grid_expands_into_copies_with_unique_ids_at_each_cell_and_passes_a_try(scope):
    spec = {"kind": "grid", "source": "pillar", "rows": 3, "columns": 4, "spacing": [2, 1.5]}
    observation = pattern(scope, PatternArgs.model_validate({"pattern": spec}))
    expanded = json.loads(observation.text.splitlines()[0].removeprefix("Expanded: "))
    tried = _tried(scope, observation)
    assert tried["passed"] and expanded["copies"] == 11 and expanded["operations"] == 11
    candidate = _candidate(scope, tried["try_id"])
    ids = [obj.id for obj in candidate.world.objects]
    assert len(ids) == len(set(ids)) == 8 + 11
    spots = {_transform(candidate, item)["position"] for item in expanded["created"]}
    wanted = {(5 + c * 2, r * 1.5, 1) for r in range(3) for c in range(4)} - {(5, 0, 1)}
    assert spots == {tuple(map(float, spot)) for spot in wanted}


def test_duplicating_a_group_copies_its_subtree_with_children_reparented_to_the_new_root(scope):
    spec = {"kind": "duplicate", "source": "table", "offset": [3, 0, 0]}
    tried = _tried(scope, pattern(scope, PatternArgs.model_validate({"pattern": spec})))
    candidate = _candidate(scope, tried["try_id"])
    created = candidate.world.objects[8:]
    root = created[0]
    assert root.id == "table_2" and root.parent is None
    assert {obj.parent for obj in created[1:]} == {"table_2"} and {obj.id for obj in created[1:]} == {
        "table_top_2",
        "table_leg_2",
    }
    assert _transform(candidate, "table_2")["position"] == (3.0, 5.0, 0.0)
    assert _transform(candidate, "table_leg_2") == _transform(candidate, "table_leg")


def test_a_circle_places_copies_on_the_radius_with_their_front_turned_to_the_center(scope):
    spec = {"kind": "circle", "source": "pillar", "count": 4, "center": [0, 0], "radius_m": 3, "facing": "center"}
    tried = _tried(scope, pattern(scope, PatternArgs.model_validate({"pattern": spec})))
    candidate = _candidate(scope, tried["try_id"])
    for number, obj in enumerate(candidate.world.objects[8:]):
        values = _transform(candidate, obj.id)
        angle = math.radians(90 * number)
        assert values["position"][:2] == pytest.approx((3 * math.cos(angle), 3 * math.sin(angle)), abs=1e-3)
        front = rotation_matrix(values["rotation"]) @ np.array([1.0, 0.0, 0.0])
        assert front[:2] == pytest.approx((-math.cos(angle), -math.sin(angle)), abs=1e-3)


def test_a_mirror_reflects_the_root_position_and_turn_and_the_children_inside(scope):
    spec = {"kind": "mirror", "source": "table", "axis": "x", "plane_at": 2}
    tried = _tried(scope, pattern(scope, PatternArgs.model_validate({"pattern": spec})))
    candidate = _candidate(scope, tried["try_id"])
    root = _transform(candidate, "table_2")
    assert root["position"] == (4.0, 5.0, 0.0) and root["rotation"] == pytest.approx((0, 0, -30), abs=1e-3)
    assert _transform(candidate, "table_leg_2")["position"] == (-0.4, 0.4, 0.4)


def test_a_seeded_scatter_repeats_keeps_its_spacing_and_stays_clear_of_what_must_stay_clear(scope):
    spec = {
        "kind": "scatter",
        "source": "pillar",
        "count": 12,
        "area": {"min": [-10, -10], "max": [10, 10]},
        "min_spacing_m": 2.5,
        "seed": 7,
        "keep_clear": ["table", "spawn"],
        "clearance_m": 1.0,
        "jitter": {"rotation_deg": 45, "color": 0.3},
    }
    first = _tried(scope, pattern(scope, PatternArgs.model_validate({"pattern": spec})))
    again = _tried(scope, pattern(scope, PatternArgs.model_validate({"pattern": spec})))
    one, two = _candidate(scope, first["try_id"]), _candidate(scope, again["try_id"])
    assert [_transform(one, o.id) for o in one.world.objects[8:]] == [
        _transform(two, o.id) for o in two.world.objects[8:]
    ]
    spots = [np.array(_transform(one, o.id)["position"][:2]) for o in one.world.objects[8:]]
    assert len(spots) == 12
    assert min(np.linalg.norm(a - b) for i, a in enumerate(spots) for b in spots[i + 1 :]) >= 2.5
    # The table's legs and top span about 1.4 m around (0, 5); each pillar is 0.5 m wide.
    assert all(np.linalg.norm(spot - (0, 5)) > 1.0 + 0.25 for spot in spots)
    colors = {
        next(c for c in o.components if c.kind == "material").properties["color"].model_dump()["value"]
        for o in one.world.objects[8:]
    }
    assert len(colors) > 1


def test_rotating_a_group_around_a_pivot_moves_and_turns_only_its_root(scope):
    change = {"action": "rotate", "degrees": [0, 0, 90], "pivot": [0, 0, 0]}
    tried = _tried(scope, group(scope, GroupArgs.model_validate({"object": "table", "change": change})))
    candidate = _candidate(scope, tried["try_id"])
    root = _transform(candidate, "table")
    assert root["position"] == pytest.approx((-5, 0, 0), abs=1e-4) and root["rotation"][2] == pytest.approx(120)
    assert _transform(candidate, "table_leg") == _transform(scope.state.project, "table_leg")


def test_scaling_a_group_grows_the_gaps_and_sizes_inside_it(scope):
    change = {"action": "scale", "factor": 2}
    tried = _tried(scope, group(scope, GroupArgs.model_validate({"object": "table", "change": change})))
    candidate = _candidate(scope, tried["try_id"])
    leg = _transform(candidate, "table_leg")
    assert leg["position"] == (0.8, 0.8, 0.8) and leg["scale"] == (2.0, 2.0, 2.0)
    assert _transform(candidate, "table")["scale"] == (2.0, 2.0, 2.0)


def _world_centers(scope: TurnScope, try_id: str | None, ids: set[str]) -> list[float]:
    rows = _found(scope, on_try=try_id, fields=["id", "position"], limit=200)["rows"]
    return [value for row in sorted(rows, key=lambda row: row["id"]) if row["id"] in ids for value in row["position"]]


def test_grouping_and_ungrouping_keep_every_member_where_it_stands_in_the_world(scope):
    members = {"table_top", "table_leg", "pillar"}
    before = _world_centers(scope, None, members)
    change = {"action": "ungroup"}
    ungrouped = _tried(scope, group(scope, GroupArgs.model_validate({"object": "table", "change": change})))
    assert not any(obj.id == "table" for obj in _candidate(scope, ungrouped["try_id"]).world.objects)
    assert _world_centers(scope, ungrouped["try_id"], members) == pytest.approx(before, abs=2e-3)
    change = {"action": "make_group", "members": ["table_top", "table_leg", "pillar"], "name": "Corner"}
    args = {"object": "pillar", "change": change, "base_try": ungrouped["try_id"]}
    grouped = _tried(scope, group(scope, GroupArgs.model_validate(args)))
    candidate = _candidate(scope, grouped["try_id"])
    new_group = next(obj for obj in candidate.world.objects if obj.name == "Corner")
    assert {obj.id for obj in candidate.world.objects if obj.parent == new_group.id} == members
    assert _world_centers(scope, grouped["try_id"], members) == pytest.approx(before, abs=2e-3)


def test_editing_every_match_sets_the_property_reports_what_lacks_it_and_respects_the_cap(scope):
    change = {"component": "material", "property": "color", "value": {"type": "color", "value": "#ffffff"}}
    args = {"filter": {"text": "table"}, "changes": [change], "limit": 1}
    observation = matching_edit(scope, MatchingArgs.model_validate(args))
    expanded = json.loads(observation.text.splitlines()[0].removeprefix("Expanded: "))
    assert expanded["edited"] == 1 and expanded["left_out_by_the_cap"] == 1
    assert expanded["lacking_the_component"] == ["table"]
    tried = _tried(scope, observation)
    (operation,) = scope.tries[tried["try_id"]].operations
    assert isinstance(operation, SetProperty) and operation.object == "table_top" and operation.property == "color"


def test_a_try_builds_on_an_earlier_try_and_the_proposal_holds_both(scope):
    spec = {"kind": "linear", "source": "pillar", "count": 60, "offset": [0, 1, 0]}
    first = _tried(scope, pattern(scope, PatternArgs.model_validate({"pattern": spec})))
    rename = {"op": "rename_object", "object": "pillar", "name": "Column"}
    second = json.loads(
        try_change(scope, TryArgs.model_validate({"operations": [rename], "base_try": first["try_id"]})).text
    )
    assert second["passed"] and len(scope.tries[second["try_id"]].operations) == 61
    propose(scope, ProposeArgs(try_id=second["try_id"], summary="Columns", explanation="A long row of columns."))
    assert scope.proposal is not None and len(scope.proposal.operations) == 61


def test_a_pattern_that_would_pass_the_operation_limit_is_refused_with_how_many_fit(scope):
    spec = {"kind": "linear", "source": "table", "count": 200, "offset": [0, 2, 0]}
    observation = pattern(scope, PatternArgs.model_validate({"pattern": spec}))
    assert not observation.ok and "3 per copy" in observation.text and "500" in observation.text
    assert not scope.tries


def test_rotation_angles_round_trip_through_the_compilers_rotation():
    for angles in [(30.0, 40.0, 50.0), (-170.0, 20.0, 135.0), (0.0, 0.0, -90.0)]:
        assert rotation_degrees(rotation_matrix(angles)) == pytest.approx(angles, abs=1e-6)
