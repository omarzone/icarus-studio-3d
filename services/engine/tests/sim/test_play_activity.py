import numpy as np
import pytest
import torch
from stable_baselines3 import PPO

from icarus.sim.env import ProjectEnv
from icarus.sim.model_state import observation
from icarus.sim.play import PlaySession
from icarus.sim.policy import CheckpointPolicy, RandomPolicy


class Watched(CheckpointPolicy):
    """A checkpoint brain that remembers every observation it acted on."""

    seen: list[np.ndarray]

    def act(self, observation: np.ndarray) -> np.ndarray:
        self.seen.append(observation.copy())
        return super().act(observation)


@pytest.fixture
def saved(tmp_path, parking):
    model = PPO(
        "MlpPolicy", ProjectEnv(parking), seed=0, device="cpu", policy_kwargs={"net_arch": {"pi": [8, 6], "vf": [8]}}
    )
    path = tmp_path / "0.zip"
    model.save(path)
    return model, path


def test_streamed_activity_is_the_policys_forward_pass_on_the_observation_it_acted_on(saved, parking):
    model, path = saved
    brain = Watched(PPO.load(path, device="cpu"), "Trained brain: Run 1 at 0 steps")
    brain.seen = []
    session = PlaySession(parking, 1, brain, seed=0)
    session.step_realtime(0.5)
    activity = session.activity()
    assert activity is not None
    assert session.info().activity
    np.testing.assert_allclose(activity.observation, brain.seen[-1], rtol=1e-6)
    observed = np.asarray(activity.observation, dtype=np.float32)
    with torch.no_grad():
        tensor, _ = model.policy.obs_to_tensor(observed)
        features = model.policy.extract_features(tensor, model.policy.pi_features_extractor)
        latent = model.policy.mlp_extractor.forward_actor(features)
        mean = model.policy.action_net(latent)
    assert [len(layer) for layer in activity.layers] == [8, 6]
    np.testing.assert_allclose(activity.layers[-1], latent[0].numpy(), rtol=1e-5, atol=1e-6)
    np.testing.assert_allclose(activity.outputs, mean[0].numpy(), rtol=1e-5, atol=1e-6)
    expected, _ = model.predict(observed, deterministic=True)
    np.testing.assert_allclose(np.clip(activity.outputs, -1, 1), expected, rtol=1e-5, atol=1e-6)


def test_the_first_activity_is_read_on_the_starting_observation(saved, parking):
    _, path = saved
    session = PlaySession(parking, 1, CheckpointPolicy.load(path, "x", observation_size=13), seed=0)
    activity = session.activity()
    assert activity is not None and activity.step == 0
    np.testing.assert_allclose(activity.observation, observation(session.world), rtol=1e-6)


def test_random_actions_have_no_neurons_to_show(parking):
    session = PlaySession(parking, 1, RandomPolicy(4, seed=0), seed=0)
    assert session.activity() is None
    assert not session.info().activity
