from pathlib import Path
from typing import Any

import numpy as np

from icarus.contracts.brain_network import BrainActivations, BrainNetwork, NetworkInput, NetworkLayer, NetworkOutput
from icarus.contracts.project import Project
from icarus.sim.env import ProjectEnv
from icarus.sim.model_state import LiveWorld, build_world
from icarus.training.evaluation import EVALUATION_SEED

_AXES = ("x", "y", "z")


def _owner(world: LiveWorld, qpos_address: int) -> str:
    model = world.model
    for index in range(model.njnt):
        if int(model.jnt_qposadr[index]) == qpos_address:
            body: str = model.body(int(model.jnt_bodyid[index])).name
            return world.object_names.get(body, body)
    return "Joint"


def _labels(world: LiveWorld) -> list[tuple[str, str | None]]:
    """Labels in the order sim.model_state.observation concatenates its values."""
    labels: list[tuple[str, str | None]] = []
    for sensor in world.sensors:
        names = list(sensor.parts) or (
            [sensor.label] if sensor.dim == 1 else [f"{sensor.label} {_AXES[i % 3]}" for i in range(sensor.dim)]
        )
        labels += [(name, sensor.id) for name in names]
    speeds = [(f"{_owner(world, position)} speed", None) for position, _ in world.joint_addresses]
    if world.family == "navigation":
        labels += [("Forward speed", None), ("Side speed", None), ("Turn rate", None)]
        labels += [(f"{_owner(world, address)} position", None) for address, _, _ in world.limited_joints]
        labels += [("Goal distance", None), ("Goal direction ahead", None), ("Goal direction left", None)]
        if world.carried is not None:
            carried = ("Object ahead", "Object left", "Goal ahead of object", "Goal left of object")
            labels += [(name, None) for name in carried]
        if world.legged:
            labels += speeds
    if world.family in ("locomotion", "imitation"):
        labels += [(f"{_owner(world, position)} angle", None) for position, _ in world.joint_addresses]
        labels += speeds
    if world.family == "imitation":
        labels.append(("Moment of the clip", None))
    return labels


def input_labels(world: LiveWorld) -> list[NetworkInput]:
    return [NetworkInput(index=i, label=label, sensor=sensor) for i, (label, sensor) in enumerate(_labels(world))]


def output_labels(world: LiveWorld) -> list[NetworkOutput]:
    return [
        NetworkOutput(index=i, label=actuator.label, actuator=actuator.id) for i, actuator in enumerate(world.actuators)
    ]


def _load(path: Path) -> Any:
    from stable_baselines3 import PPO

    return PPO.load(path, device="cpu")


def _hidden(model: Any) -> list[tuple[Any, Any]]:
    """Pairs of (linear, activation) modules of the policy branch."""
    modules = list(model.policy.mlp_extractor.policy_net)
    return [(modules[i], modules[i + 1]) for i in range(0, len(modules) - 1, 2)]


def read_network(path: Path, project: Project, run_id: str, step: int) -> BrainNetwork:
    model = _load(path)
    world = build_world(project)
    layers = [
        NetworkLayer(name=f"Layer {i + 1}", size=int(linear.out_features), activation=type(act).__name__.lower())
        for i, (linear, act) in enumerate(_hidden(model))
    ]
    return BrainNetwork(
        run_id=run_id, step=step, inputs=input_labels(world), layers=layers, outputs=output_labels(world)
    )


def read_activations(path: Path, project: Project, run_id: str, step: int) -> BrainActivations:
    import torch

    model = _load(path)
    env = ProjectEnv(project)
    observed, _ = env.reset(seed=EVALUATION_SEED)
    if model.observation_space.shape != observed.shape:
        raise ValueError(
            f"The checkpoint expects an observation of {model.observation_space.shape}, the body gives {observed.shape}"
        )
    policy = model.policy
    layers: list[list[float]] = []
    with torch.no_grad():
        tensor, _ = policy.obs_to_tensor(np.asarray(observed, dtype=np.float32))
        signal = policy.extract_features(tensor, policy.pi_features_extractor)
        for linear, act in _hidden(model):
            signal = act(linear(signal))
            layers.append([float(value) for value in signal[0]])
        outputs = [float(value) for value in policy.action_net(signal)[0]]
    return BrainActivations(
        run_id=run_id,
        step=step,
        observation_labels=[label for label, _ in _labels(env.world)],
        observation=[float(value) for value in observed],
        layers=layers,
        outputs=outputs,
    )
