import math

import mujoco
import numpy as np
import pytest
from gymnasium.utils.env_checker import check_env

from icarus.sim.env import ProjectEnv
from icarus.sim.model_state import observation
from icarus.sim.rewards import OBJECT_REST_BONUS
from tests.sim.conftest import project_from, pusher, with_term


def idle(env: ProjectEnv) -> np.ndarray:
    return np.zeros(len(env.world.actuators), dtype=np.float32)


def free_address(env: ProjectEnv, object_id: str) -> int:
    model = env.world.model
    body = int(mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, object_id))
    return int(model.jnt_qposadr[int(model.body_jntadr[body])])


def test_a_car_pushing_a_crate_passes_check_env_and_observes_where_the_crate_is():
    env = ProjectEnv(pusher())
    check_env(env, skip_render_check=True)
    plain = ProjectEnv(project_from("parking_car"))
    assert observation(env.world).shape[0] == observation(plain.world).shape[0] + 4
    env.reset(seed=0)
    _, _, _, _, info = env.step(idle(env))
    assert math.isfinite(info["reward_parts"]["object_to_goal"])


def test_the_episode_succeeds_when_the_crate_comes_to_rest_in_the_goal_even_if_the_car_does_not():
    env = ProjectEnv(pusher())
    env.reset(seed=0)
    world = env.world
    crate = free_address(env, "crate")
    goal = world.data.site_xpos[world.goal.site] if world.goal else np.zeros(3)
    world.data.qpos[crate : crate + 2] = goal[:2]
    mujoco.mj_forward(world.model, world.data)
    _, _, terminated, _, info = env.step(idle(env))
    assert terminated and info["is_success"]
    assert info["reward_parts"]["object_to_goal"] >= OBJECT_REST_BONUS - 1


def test_coverage_pays_for_new_cells_once_per_episode():
    project = with_term(project_from("parking_car"), "coverage", 1.0, cell_size={"type": "number", "value": 0.5})
    env = ProjectEnv(project)

    def drive_ahead() -> float:
        address = free_address(env, "car")
        env.world.data.qpos[address] += 3.0
        mujoco.mj_forward(env.world.model, env.world.data)
        return env.step(idle(env))[4]["reward_parts"]["coverage"]

    env.reset(seed=0)
    assert drive_ahead() == pytest.approx(1.0)
    assert env.step(idle(env))[4]["reward_parts"]["coverage"] == 0
    env.reset(seed=0)
    assert drive_ahead() == pytest.approx(1.0)


def test_height_gain_pays_a_walker_lifted_above_its_start():
    env = ProjectEnv(with_term(project_from("walker_robot"), "height_gain", 1.0))
    env.reset(seed=0)
    assert env.step(idle(env))[4]["reward_parts"]["height_gain"] == pytest.approx(0.0, abs=0.02)
    env.reset(seed=0)
    address = free_address(env, "torso")
    env.world.data.qpos[address + 2] += 0.3
    mujoco.mj_forward(env.world.model, env.world.data)
    assert env.step(idle(env))[4]["reward_parts"]["height_gain"] == pytest.approx(0.3, abs=0.03)
