"""A ground slab holds bodies up only over its own footprint: past an edge they fall, and falling off ends a try in
every task family. An endless ground plane, as older projects store it, still holds a body anywhere."""

import mujoco
import numpy as np
import pytest

from icarus.contracts.operations import SetProperty
from icarus.contracts.project import Project
from icarus.contracts.properties import VectorValue
from icarus.projects.operations import apply_operations
from icarus.sim.env import ProjectEnv
from icarus.sim.model_state import build_world, reward_state
from tests.sim.conftest import project_from, raw_parking

SMALL_GROUND = (12.0, 12.0, 1.0)


def _small_ground(project: Project) -> Project:
    size = VectorValue(type="vector", value=SMALL_GROUND)
    return apply_operations(
        project, [SetProperty(op="set_property", object="ground", component="ground", property="size", value=size)]
    )


def _moved_to(world, x: float) -> None:
    address = int(world.model.jnt_qposadr[int(world.model.body_jntadr[world.agent])])
    world.data.qpos[address] = x
    world.data.qvel[:] = 0
    mujoco.mj_forward(world.model, world.data)


def test_a_car_driven_past_the_ground_edge_falls_and_its_try_ends_as_a_failure():
    env = ProjectEnv(_small_ground(project_from("parking_car")))
    env.reset(seed=0)
    world = env.world
    assert world.floor == pytest.approx(0.0)
    _moved_to(world, SMALL_GROUND[0] / 2 + 2)
    start = float(world.data.xpos[world.agent, 2])
    terminated, info = False, {}
    for _ in range(60):
        _, _, terminated, truncated, info = env.step(np.zeros(len(world.actuators), dtype=np.float32))
        if terminated or truncated:
            break
    assert terminated and info["failed"] and not info["is_success"]
    assert float(world.data.xpos[world.agent, 2]) < start - 1.0


def test_inside_the_edges_the_same_car_rests_on_the_slab_and_keeps_going():
    env = ProjectEnv(_small_ground(project_from("parking_car")))
    env.reset(seed=0)
    world = env.world
    _moved_to(world, SMALL_GROUND[0] / 2 - 3)
    start = float(world.data.xpos[world.agent, 2])
    for _ in range(30):
        _, _, terminated, _, _ = env.step(np.zeros(len(world.actuators), dtype=np.float32))
        assert not terminated
    assert float(world.data.xpos[world.agent, 2]) == pytest.approx(start, abs=0.05)


@pytest.mark.parametrize("family", ["navigation", "locomotion", "none"])
def test_falling_below_the_ground_counts_as_a_fall_for_every_task_family(family):
    project = _small_ground(project_from("parking_car"))
    world = build_world(project.model_copy(update={"task": project.task.model_copy(update={"family": family})}))
    _moved_to(world, SMALL_GROUND[0] / 2 + 2)
    for _ in range(600):
        mujoco.mj_step(world.model, world.data)
    assert reward_state(world).fallen


def test_an_endless_ground_plane_from_an_older_project_holds_a_body_far_from_its_drawn_size():
    world = build_world(raw_parking())
    _moved_to(world, 80.0)
    start = float(world.data.xpos[world.agent, 2])
    for _ in range(600):
        mujoco.mj_step(world.model, world.data)
    assert float(world.data.xpos[world.agent, 2]) == pytest.approx(start, abs=0.1)
    assert not reward_state(world).fallen
