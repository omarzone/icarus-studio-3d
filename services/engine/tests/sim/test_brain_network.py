import numpy as np
import pytest
from stable_baselines3 import PPO

from icarus.sim.brain_network import input_labels, output_labels, read_activations, read_network
from icarus.sim.env import ProjectEnv
from icarus.sim.model_state import build_world, observation
from icarus.training.evaluation import EVALUATION_SEED


@pytest.mark.parametrize("name", ["parking", "walker"])
def test_every_observation_value_has_a_label_and_sensor_values_name_their_sensor(request, name):
    world = build_world(request.getfixturevalue(name))
    labels = input_labels(world)
    assert len(labels) == observation(world).shape[0]
    assert [label.index for label in labels] == list(range(len(labels)))
    sensor_ids = {sensor.id for sensor in world.sensors}
    named = [label for label in labels if label.sensor is not None]
    assert named and all(label.sensor in sensor_ids for label in named)
    assert len(named) == sum(sensor.dim for sensor in world.sensors)


def test_navigation_labels_end_with_the_goal(parking):
    labels = [label.label for label in input_labels(build_world(parking))]
    assert labels[-3:] == ["Goal distance", "Goal direction ahead", "Goal direction left"]


def test_outputs_are_the_actuators_in_action_order(parking):
    world = build_world(parking)
    outputs = output_labels(world)
    assert [output.actuator for output in outputs] == [actuator.id for actuator in world.actuators]
    assert [output.label for output in outputs] == [actuator.label for actuator in world.actuators]


@pytest.fixture
def saved(tmp_path, parking):
    model = PPO(
        "MlpPolicy", ProjectEnv(parking), seed=0, device="cpu", policy_kwargs={"net_arch": {"pi": [8, 6], "vf": [8]}}
    )
    path = tmp_path / "0.zip"
    model.save(path)
    return model, path


def test_the_network_reads_the_policy_layers_of_the_checkpoint(saved, parking):
    _, path = saved
    network = read_network(path, parking, "run1", 0)
    assert [(layer.size, layer.activation) for layer in network.layers] == [(8, "tanh"), (6, "tanh")]
    assert len(network.inputs) == 13
    assert len(network.outputs) == len(build_world(parking).actuators)


def test_activations_reproduce_the_deterministic_action_on_the_evaluation_seed(saved, parking):
    model, path = saved
    activations = read_activations(path, parking, "run1", 0)
    observed, _ = ProjectEnv(parking).reset(seed=EVALUATION_SEED)
    np.testing.assert_allclose(activations.observation, observed, rtol=1e-5)
    assert [len(layer) for layer in activations.layers] == [8, 6]
    expected, _ = model.predict(observed, deterministic=True)
    np.testing.assert_allclose(np.clip(activations.outputs, -1, 1), expected, rtol=1e-5, atol=1e-6)
    assert len(activations.observation_labels) == 13


def test_a_checkpoint_for_another_body_is_refused(saved, walker):
    _, path = saved
    with pytest.raises(ValueError, match="observation"):
        read_activations(path, walker, "run1", 0)
