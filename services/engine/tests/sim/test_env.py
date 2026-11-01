import numpy as np
import pytest
from gymnasium.utils.env_checker import check_env

from icarus.sim.env import ProjectEnv
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
    assert first.shape == (50, 8)
    np.testing.assert_array_equal(first, second)


def test_a_different_seed_with_randomization_changes_friction(parking):
    env = ProjectEnv(parking, randomize=True)
    env.reset(seed=1)
    first = env.world.model.geom_friction[:, 0].copy()
    env.reset(seed=2)
    assert not np.allclose(first, env.world.model.geom_friction[:, 0])
    assert np.all(np.abs(first / ProjectEnv(parking).world.model.geom_friction[:, 0] - 1) <= 0.2 + 1e-9)


def test_navigation_observes_the_goal_in_the_agent_frame(parking):
    env = ProjectEnv(parking)
    observation, _ = env.reset(seed=0)
    car, goal = car_start(env)[:2], np.array([12.0, 0.0])
    assert np.linalg.norm(observation[-3:-1]) == pytest.approx(np.linalg.norm(goal - car), abs=1e-6)
    assert observation[-1] == pytest.approx(-0.5, abs=1e-6)


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
