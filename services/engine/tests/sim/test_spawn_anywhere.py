"""Start anywhere: tries start at free places spread over the whole map, clear of obstacles, away from the goal and
with a way to it, deterministic per seed; Start area left at 0 × 0 does the same."""

import math
from functools import cache

import numpy as np
from pydantic import TypeAdapter

from icarus.contracts.operations import EditOperation, SetProperty
from icarus.contracts.project import Project
from icarus.contracts.properties import ChoiceValue, NumberValue, PropertyValue
from icarus.design.checks import design_report
from icarus.library.layouts import Layout, LayoutParams, expand_layout
from icarus.projects.operations import apply_operations
from icarus.sim.env import ProjectEnv
from icarus.sim.model_state import touching
from icarus.training.evaluation import EVALUATION_SEED
from tests.sim.conftest import project_from

TILE = 4.0


def _spawn(prop: str, value: PropertyValue) -> SetProperty:
    return SetProperty(op="set_property", object="spawn", component="spawn_point", property=prop, value=value)


def _mode(mode: str) -> SetProperty:
    return _spawn("mode", ChoiceValue(type="choice", value=mode))


@cache
def _lot() -> tuple[Layout, Project]:
    base = project_from("parking_car")
    params = TypeAdapter(LayoutParams).validate_python({"recipe": "parking_lot", "seed": 1})
    layout = expand_layout(params, base)
    return layout, apply_operations(base, layout.operations)


def _lot_with(*operations: EditOperation) -> Project:
    return apply_operations(_lot()[1], list(operations))


def _starts(env: ProjectEnv, seeds: range) -> list[tuple[float, float, float]]:
    world = env.world
    found = []
    for seed in seeds:
        env.reset(seed=seed)
        assert not touching(world)
        x, y = (float(value) for value in world.data.xpos[world.agent][:2])
        frame = world.data.xmat[world.agent].reshape(3, 3)
        found.append((x, y, math.degrees(math.atan2(frame[1, 0], frame[0, 0]))))
    return found


def test_anywhere_spreads_starts_over_the_lanes_clear_of_obstacles_away_from_the_goal_and_with_a_way_to_it():
    layout, _ = _lot()
    env = ProjectEnv(_lot_with(_mode("anywhere")), randomize=True)
    free = env.world.spawn.free if env.world.spawn else None
    assert free is not None and free.roomy
    starts = _starts(env, range(300))
    zone = env.world.goal
    assert zone is not None
    goal = env.world.data.site_xpos[zone.site][:2]
    site, origin = layout.site, np.array(layout.origin)
    plan = site.floor_plan(0.5)
    for x, y, _ in starts:
        assert math.hypot(x - goal[0], y - goal[1]) >= zone.radius + 3.0 - 1e-6
        local = (x - origin[0], y - origin[1])
        assert site.goal is not None and plan.path(local, site.goal) is not None
    tiles = {tuple(np.floor(place / TILE).astype(int)) for place in free.places}
    visited = {tuple(np.floor(np.array(start[:2]) / TILE).astype(int)) for start in starts}
    assert len(visited & tiles) >= 0.8 * len(tiles)
    headings = np.array([heading for _, _, heading in starts])
    assert np.histogram(headings, bins=4, range=(-180, 180))[0].min() > 30


def test_anywhere_repeats_starts_per_seed_and_evaluations_whatever_ran_before():
    project = _lot_with(_mode("anywhere"))
    first = _starts(ProjectEnv(project, randomize=True), range(8))
    assert first == _starts(ProjectEnv(project, randomize=True), range(8))
    assert len({(round(x, 2), round(y, 2)) for x, y, _ in first}) == 8
    used = ProjectEnv(project)
    _starts(used, range(5))
    seeds = range(EVALUATION_SEED, EVALUATION_SEED + 3)
    assert _starts(used, seeds) == _starts(ProjectEnv(project), seeds)


def test_an_area_left_at_zero_starts_anywhere_on_the_map():
    anywhere = _starts(ProjectEnv(_lot_with(_mode("anywhere")), randomize=True), range(6))
    area = _starts(ProjectEnv(_lot_with(_mode("area")), randomize=True), range(6))
    assert area == anywhere


def test_auto_fixed_and_a_sized_area_draw_no_free_map():
    for operations in ([], [_mode("fixed")], [_mode("area"), _spawn("area", _vector(6, 2))]):
        plan = ProjectEnv(apply_operations(project_from("parking_car"), operations)).world.spawn
        assert plan is not None and plan.free is None


def _vector(x: float, y: float) -> PropertyValue:
    return TypeAdapter(PropertyValue).validate_python({"type": "vector", "value": (x, y, 0)})


def test_a_design_with_no_free_place_to_start_fails_with_a_readable_reason():
    far = _lot_with(_mode("anywhere"), _spawn("goal_distance", NumberValue(type="number", value=50)))
    report, compiled = design_report(far)
    check = next(item for item in report.checks if item.id == "reachable")
    assert compiled is None and check.status == "fail"
    assert "Start Anywhere finds no free place" in check.detail
    report, _ = design_report(_lot_with(_mode("anywhere")))
    assert report.ok
