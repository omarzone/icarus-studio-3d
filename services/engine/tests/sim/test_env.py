import mujoco
import numpy as np
import pytest
from gymnasium.utils.env_checker import check_env

from icarus.sim.env import ProjectEnv
from icarus.sim.model_state import GOAL_DISTANCE_SCALE
from tests.sim.conftest import project_from


@pytest.mark.parametrize("template", ["parking_car", "walker_robot"])
def test_check_env_passes(template):
    check_env(ProjectEnv(project_from(template)), skip_render_check=True)


def first_observations(env: ProjectEnv, seed: int, count: int = 50) -> np.ndarray:
    actions = np.random.default_rng(7).uniform(-1, 1, (count, len(env.world.actuators)))
    observations = [env.reset(seed=seed)[0]]
    for action in actions[: count - 1]:
        observations.append(env.step(action.astype(np.float32))[0])
    return np.array(observations)


def test_the_same_seed_gives_the_same_first_fifty_observations(parking):
    first = first_observations(ProjectEnv(parking, randomize=True), seed=3)
    second = first_observations(ProjectEnv(parking, randomize=True), seed=3)
    assert first.shape == (50, 13)
    np.testing.assert_array_equal(first, second)


def test_a_different_seed_with_randomization_changes_friction(parking):
    env = ProjectEnv(parking, randomize=True)
    env.reset(seed=1)
    first = env.world.model.geom_friction[:, 0].copy()
    env.reset(seed=2)
    assert not np.allclose(first, env.world.model.geom_friction[:, 0])
    assert np.all(np.abs(first / ProjectEnv(parking).world.model.geom_friction[:, 0] - 1) <= 0.2 + 1e-9)


def test_navigation_observes_the_goal_distance_from_the_random_start(parking):
    env = ProjectEnv(parking)
    observation, _ = env.reset(seed=0)
    car, goal = car_start(env)[:2], np.array([12.0, 0.0])
    assert observation[-3] * GOAL_DISTANCE_SCALE == pytest.approx(np.linalg.norm(goal - car), abs=1e-5)
    assert np.hypot(observation[-2], observation[-1]) == pytest.approx(1.0, abs=1e-6)


def drive(env: ProjectEnv, throttle: float) -> np.ndarray:
    action = np.zeros(len(env.world.actuators), dtype=np.float32)
    for index, actuator in enumerate(env.world.actuators):
        if actuator.unit is None:
            action[index] = throttle
    return action


def place_car(env: ProjectEnv, x: float, y: float) -> None:
    model, data = env.world.model, env.world.data
    free = model.jnt_qposadr[model.body_jntadr[env.world.agent]]
    data.qpos[free : free + 2] = (x, y)
    data.qpos[free + 3 : free + 7] = (1, 0, 0, 0)
    mujoco.mj_forward(model, data)


def planar_speed(env: ProjectEnv) -> float:
    model, data = env.world.model, env.world.data
    dof = model.jnt_dofadr[model.body_jntadr[env.world.agent]]
    return float(np.hypot(data.qvel[dof], data.qvel[dof + 1]))


def test_full_drive_moves_the_car_forward_at_a_speed_that_levels_off(parking):
    env = ProjectEnv(parking)
    env.reset(seed=0)
    place_car(env, 0.0, 0.0)
    speeds = []
    for _ in range(4):
        for _ in range(100):
            env.step(drive(env, 1.0))
        speeds.append(planar_speed(env))
    assert env.world.data.xpos[env.world.agent, 0] > 10
    assert speeds[-1] < 3 and speeds[-1] == pytest.approx(speeds[-2], rel=0.02)


def test_a_navigation_episode_succeeds_only_once_the_agent_stops_inside_the_goal(parking):
    env = ProjectEnv(parking)
    env.reset(seed=0)
    place_car(env, 9.0, 0.0)
    inside_moving = False
    for _ in range(200):
        assert not env.step(drive(env, 1.0))[2]
        if np.hypot(env.world.data.xpos[env.world.agent, 0] - 12, env.world.data.xpos[env.world.agent, 1]) < 1.4:
            inside_moving = planar_speed(env) > 0.5
            break
    assert inside_moving
    terminated, steps, reward, info = False, 0, 0.0, {}
    while not terminated:
        _, reward, terminated, truncated, info = env.step(drive(env, 0.0))
        steps += 1
        assert not truncated
    assert info["is_success"] is True and steps > 1 and reward > 5


def car_start(env: ProjectEnv) -> np.ndarray:
    """Across, along and heading in degrees of the car right after reset."""
    data, car = env.world.data, env.world.agent
    assert car is not None
    forward = data.xmat[car].reshape(3, 3)[:, 0]
    return np.array([data.xpos[car, 0], data.xpos[car, 1], np.degrees(np.arctan2(forward[1], forward[0]))])


def test_navigation_starts_at_a_seeded_random_pose_behind_the_spawn(parking):
    env = ProjectEnv(parking)
    starts = []
    for seed in range(40):
        env.reset(seed=seed)
        starts.append(car_start(env))
    x, y, heading = np.array(starts).T
    assert np.all((x >= -2 - 1e-9) & (x <= 1e-9)) and np.all(np.abs(y) <= 1.5 + 1e-9)
    assert np.all(np.abs(heading) <= 35 + 1e-6)
    assert np.ptp(x) > 1 and np.ptp(y) > 2 and np.ptp(heading) > 40


def test_the_same_seed_gives_the_same_start_and_a_different_seed_another(parking):
    env = ProjectEnv(parking)
    env.reset(seed=5)
    first = car_start(env)
    env.reset(seed=6)
    other = car_start(env)
    env.reset(seed=5)
    np.testing.assert_array_equal(first, car_start(env))
    assert not np.allclose(first, other)


def test_locomotion_still_starts_at_the_spawn(walker):
    env = ProjectEnv(walker)
    env.reset(seed=1)
    first = env.world.data.qpos.copy()
    env.reset(seed=2)
    np.testing.assert_array_equal(first, env.world.data.qpos)


def test_a_project_without_a_task_family_is_rejected():
    with pytest.raises(ValueError):
        ProjectEnv(project_from("empty_world"))


def test_copy_poses_cover_every_moving_geom_and_match_mujoco(parking):
    env = ProjectEnv(parking)
    env.reset(seed=0)
    for _ in range(5):
        env.step(np.ones(len(env.world.actuators), dtype=np.float32))
    model, data = env.world.model, env.world.data
    names = env.moving_geoms
    assert "car" in names and all(model.body_weldid[model.geom(name).bodyid[0]] != 0 for name in names)
    poses = env.poses()
    assert len(poses.positions) == len(poses.quaternions) == len(names)
    car = names.index("car")
    np.testing.assert_allclose(poses.positions[car], data.geom_xpos[model.geom("car").id])
    assert abs(np.linalg.norm(poses.quaternions[car]) - 1) < 1e-9


def test_the_last_step_of_an_episode_reports_its_outcome_and_reward_terms(parking):
    env = ProjectEnv(parking)
    env.reset(seed=0)
    total, info, done = 0.0, {}, False
    while not done:
        _, reward, terminated, truncated, info = env.step(np.zeros(len(env.world.actuators), dtype=np.float32))
        total += reward
        done = terminated or truncated
    assert info["is_success"] is False and info["failed"] is False
    assert set(info["episode_terms"]) == {"reach_goal", "progress_to_goal", "collision_penalty", "time_penalty"}
    assert sum(info["episode_terms"].values()) == pytest.approx(total)


@pytest.mark.parametrize("steer", [1.0, -1.0])
def test_full_steering_reaches_its_limit_and_turns_the_car_on_a_tight_circle(parking, steer):
    env = ProjectEnv(parking)
    env.reset(seed=0)
    place_car(env, 0.0, 0.0)
    action = np.where(drive(env, 1.0) != 0, 0.5, steer).astype(np.float32)
    observation = None
    for _ in range(100):
        observation, *_ = env.step(action)
    assert observation is not None
    np.testing.assert_allclose(observation[8:10], steer, atol=0.05)
    model, data = env.world.model, env.world.data
    forward = data.xmat[env.world.agent].reshape(3, 3)[:, 0]
    assert np.sign(np.arctan2(forward[1], forward[0])) == steer
    chassis = model.geom("car").id
    assert all(chassis not in (contact.geom1, contact.geom2) for contact in data.contact[: data.ncon])
