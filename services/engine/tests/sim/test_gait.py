import mujoco
import numpy as np
import pytest

from icarus.contracts.operations import EditOperation, RemoveComponent
from icarus.projects.operations import apply_operations
from icarus.sim.env import ProjectEnv
from icarus.sim.gait import at_limits, landings
from tests.sim.conftest import project_from, with_term


def foot_names(env: ProjectEnv) -> list[str]:
    return [env.world.model.body(foot).name for foot in env.world.feet]


def test_parts_with_a_touch_sensor_are_the_feet():
    assert foot_names(ProjectEnv(project_from("humanoid"))) == ["foot_left", "foot_right"]


def test_without_touch_sensors_the_low_leg_tips_are_the_feet_and_hands_and_head_are_not():
    strip: list[EditOperation] = [
        RemoveComponent(op="remove_component", object=f"foot_{side}", component="touch") for side in ("left", "right")
    ]
    env = ProjectEnv(apply_operations(project_from("humanoid"), strip))
    assert sorted(foot_names(env)) == ["foot_left", "foot_right"]


def test_a_landing_reports_the_time_the_foot_spent_in_the_air():
    lifted: list[float | None] = [None, None]
    assert landings(lifted, (True, True), 0.0) == (0.0, 0.0)
    assert landings(lifted, (False, True), 0.1) == (0.0, 0.0)
    assert landings(lifted, (False, True), 0.3) == (0.0, 0.0)
    assert landings(lifted, (True, True), 0.45) == pytest.approx((0.35, 0.0))
    assert lifted == [None, None]


def test_the_walker_lands_on_both_feet_and_a_joint_at_its_stop_counts_as_at_a_limit():
    env = ProjectEnv(with_term(project_from("walker_robot"), "joint_limits", -1.0))
    env.reset(seed=0)
    world = env.world
    assert env.state.at_limits == pytest.approx(2 / 6)
    for _ in range(5):
        env.step(np.zeros(len(world.actuators), dtype=np.float32))
    assert env.state.feet_down == (True, True)
    for address, low, high in world.limited_joints:
        world.data.qpos[address] = (low + high) / 2
    knee = int(mujoco.mj_name2id(world.model, mujoco.mjtObj.mjOBJ_JOINT, "shin_left:joint"))
    assert at_limits(world.data, world.limited_joints) == 0
    world.data.qpos[int(world.model.jnt_qposadr[knee])] = float(world.model.jnt_range[knee, 1])
    assert at_limits(world.data, world.limited_joints) == pytest.approx(1 / 6)


def test_joint_limits_is_paid_through_the_environment():
    env = ProjectEnv(with_term(project_from("walker_robot"), "joint_limits", -1.0))
    env.reset(seed=0)
    _, _, _, _, info = env.step(np.zeros(len(env.world.actuators), dtype=np.float32))
    assert info["reward_parts"]["joint_limits"] == pytest.approx(-env.state.at_limits)
