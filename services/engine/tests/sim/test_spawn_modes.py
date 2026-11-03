"""Where tries start, as the spawn point says: fixed, anywhere in an area with a heading range, or at one of several
spawn points picked at random or in turn. Starts follow the seed, so evaluations on fixed seeds repeat them."""

import math

import mujoco
import numpy as np
import pytest

from icarus.contracts.operations import CreateObject, EditOperation, SetProperty
from icarus.contracts.play import ResetCommand
from icarus.contracts.project import Project
from icarus.contracts.properties import ChoiceValue, NumberValue, PropertyValue, VectorValue
from icarus.library.parts import Part
from icarus.projects.operations import apply_operations
from icarus.sim.env import ProjectEnv
from icarus.sim.play import PlaySession
from icarus.sim.policy import RandomPolicy
from icarus.training.evaluation import EVALUATION_SEED
from tests.sim.conftest import project_from

SPOTS = [(0.0, 0.0), (6.0, 4.0), (-5.0, 6.0)]


def _spawn(prop: str, value: PropertyValue, obj: str = "spawn") -> SetProperty:
    return SetProperty(op="set_property", object=obj, component="spawn_point", property=prop, value=value)


def _car(mode: str, *extra: EditOperation) -> Project:
    operations: list[EditOperation] = [_spawn("mode", ChoiceValue(type="choice", value=mode)), *extra]
    return apply_operations(project_from("parking_car"), operations)


def _area_car() -> Project:
    return _car(
        "area",
        _spawn("area", VectorValue(type="vector", value=(6, 2, 0))),
        _spawn("heading_range", NumberValue(type="number", value=30)),
    )


def _points_car(mode: str) -> Project:
    spots = [
        CreateObject(
            op="create_object",
            target="world",
            object=Part(
                f"spawn_{k}", f"Spawn {k}", None, {"transform": {"position": (x, y, 0)}, "spawn_point": {}}
            ).spec(),
        )
        for k, (x, y) in enumerate(SPOTS[1:], start=2)
    ]
    return _car(mode, *spots)


def _start(env: ProjectEnv, seed: int | None = None) -> tuple[float, float, float]:
    """The agent's x, y and heading in degrees right after a reset."""
    env.reset(seed=seed)
    world = env.world
    x, y = (float(value) for value in world.data.xpos[world.agent][:2])
    frame = world.data.xmat[world.agent].reshape(3, 3)
    return x, y, math.degrees(math.atan2(frame[1, 0], frame[0, 0]))


def _designed_heading(project: Project) -> float:
    world = ProjectEnv(project).world
    mujoco.mj_resetData(world.model, world.data)
    mujoco.mj_forward(world.model, world.data)
    frame = world.data.xmat[world.agent].reshape(3, 3)
    return math.degrees(math.atan2(frame[1, 0], frame[0, 0]))


def test_a_fixed_spawn_starts_every_try_exactly_on_the_spawn_point():
    env = ProjectEnv(_car("fixed"), randomize=True)
    starts = {tuple(round(value, 6) for value in _start(env, seed)) for seed in (0, 1, 2)}
    assert len(starts) == 1
    x, y, _ = starts.pop()
    assert (x, y) == pytest.approx((0.0, 0.0), abs=1e-6)


def test_an_area_spawn_varies_starts_inside_its_rectangle_and_heading_range_and_repeats_them_per_seed():
    project = _area_car()
    designed = _designed_heading(project)
    training = ProjectEnv(project, randomize=True)
    starts = [_start(training, seed) for seed in range(12)]
    assert len({(round(x, 3), round(y, 3)) for x, y, _ in starts}) == 12
    for x, y, heading in starts:
        assert abs(x) <= 3 + 1e-6 and abs(y) <= 1 + 1e-6
        assert abs((heading - designed + 180) % 360 - 180) <= 30 + 1e-6
    again = ProjectEnv(project, randomize=True)
    assert [_start(again, seed) for seed in range(12)] == starts


def test_evaluation_seeds_give_the_same_starts_whatever_ran_before():
    project = _area_car()
    fresh = ProjectEnv(project)
    used = ProjectEnv(project)
    for _ in range(5):
        _start(used)
    seeds = [EVALUATION_SEED + k for k in range(3)]
    assert [_start(used, seed) for seed in seeds] == [_start(fresh, seed) for seed in seeds]


def test_cycling_spawn_points_takes_them_in_turn_from_the_seed_and_a_random_pick_follows_the_seed():
    cycling = ProjectEnv(_points_car("cycle_points"), randomize=True)
    first = _start(cycling, seed=4)
    following = [_start(cycling) for _ in range(3)]
    visited = [(round(x, 3), round(y, 3)) for x, y, _ in [first, *following]]
    order = [SPOTS[(4 + k) % 3] for k in range(4)]
    assert visited == [pytest.approx(spot, abs=1e-3) for spot in order]
    picking = [_start(ProjectEnv(_points_car("random_point")), seed) for seed in range(9)]
    assert {(round(x), round(y)) for x, y, _ in picking} <= {(round(x), round(y)) for x, y in SPOTS}
    assert picking == [_start(ProjectEnv(_points_car("random_point")), seed) for seed in range(9)]


def test_a_spawn_left_on_auto_keeps_the_classic_start_beside_and_behind_the_car():
    env = ProjectEnv(project_from("parking_car"))
    starts = [_start(env, seed) for seed in range(6)]
    assert len({start for start in starts}) == 6
    assert ProjectEnv(project_from("parking_car")).world.spawn is not None
    assert [_start(ProjectEnv(project_from("parking_car")), seed) for seed in range(6)] == starts


def test_play_draws_a_new_start_inside_the_area_on_every_reset():
    session = PlaySession(_area_car(), 1, RandomPolicy(3, seed=0), seed=0)
    world = session.world
    starts = set()
    for _ in range(3):
        session.apply(ResetCommand(tool="reset"))
        starts.add(tuple(np.round(world.data.xpos[world.agent][:2], 4)))
    assert len(starts) == 3
