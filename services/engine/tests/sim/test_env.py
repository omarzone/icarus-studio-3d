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
    observation, _ = ProjectEnv(parking).reset(seed=0)
    np.testing.assert_allclose(observation[-3:], [12.0, 0.0, -0.5], atol=1e-6)


def test_a_project_without_a_task_family_is_rejected():
    with pytest.raises(ValueError):
        ProjectEnv(project_from("empty_world"))
