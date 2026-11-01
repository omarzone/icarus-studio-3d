import numpy as np
import pytest
from stable_baselines3 import PPO

from icarus.sim.env import ProjectEnv
from icarus.sim.policy import CheckpointPolicy


@pytest.fixture
def saved(tmp_path, parking):
    model = PPO("MlpPolicy", ProjectEnv(parking), seed=0, device="cpu")
    path = tmp_path / "0.zip"
    model.save(path)
    return model, path


def test_a_checkpoint_acts_like_the_saved_brain_deterministically(saved, parking):
    model, path = saved
    policy = CheckpointPolicy.load(path, "Trained brain: Run 1 at 0 steps", observation_size=8)
    observation, _ = ProjectEnv(parking).reset(seed=0)
    expected, _ = model.predict(observation, deterministic=True)
    np.testing.assert_allclose(policy.act(observation), expected)
    np.testing.assert_allclose(policy.act(observation), policy.act(observation))
    assert policy.label == "Trained brain: Run 1 at 0 steps"


def test_a_checkpoint_for_another_observation_shape_is_refused(saved):
    _, path = saved
    with pytest.raises(ValueError, match="observation"):
        CheckpointPolicy.load(path, "x", observation_size=20)
