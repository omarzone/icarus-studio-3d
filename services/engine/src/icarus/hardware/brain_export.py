"""The trained brain as a portable ONNX graph, and the spec of what goes in and what comes out of it."""

import io
import warnings
from functools import lru_cache
from pathlib import Path
from typing import Any

from icarus.contracts.project import Project
from icarus.sim.brain_network import input_labels
from icarus.sim.model_state import CONTROL_PERIOD, build_world

OPSET = 17
INPUT = "observation"
OUTPUT = "action"
_PHYSICAL = ("ray", "accel", "gyro", "touch")
_BODY_MOTION = ("Forward speed", "Side speed", "Turn rate")


def _actor(policy: Any) -> Any:
    import torch

    class Actor(torch.nn.Module):
        """The deterministic action of a Stable-Baselines3 PPO policy, clipped as predict() clips it."""

        def __init__(self) -> None:
            super().__init__()
            self.features = policy.pi_features_extractor
            self.latent = policy.mlp_extractor.policy_net
            self.action = policy.action_net

        def forward(self, observation: Any) -> Any:
            return torch.clamp(self.action(self.latent(self.features(observation))), -1.0, 1.0)

    return Actor().eval()


@lru_cache(maxsize=4)
def _onnx(path: str, modified: int) -> bytes:
    import torch
    from stable_baselines3 import PPO

    model = PPO.load(path, device="cpu")
    shape = model.observation_space.shape or (0,)
    buffer = io.BytesIO()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        torch.onnx.export(
            _actor(model.policy),
            (torch.zeros(1, int(shape[0])),),
            buffer,  # pyright: ignore[reportArgumentType]  # SAFETY: the exporter writes to any binary file object
            dynamo=False,
            opset_version=OPSET,
            input_names=[INPUT],
            output_names=[OUTPUT],
            dynamic_axes={INPUT: {0: "batch"}, OUTPUT: {0: "batch"}},
        )
    return buffer.getvalue()


def brain_onnx(checkpoint: Path) -> bytes:
    """The checkpoint's policy as ONNX: float32 observation [batch, inputs] in, action [batch, outputs] in -1..1."""
    return _onnx(str(checkpoint), checkpoint.stat().st_mtime_ns)


def _source(label: str, kind: str | None) -> str:
    """Where a device gets this input: a sensor part, the joint's own encoder, or an estimate of its own."""
    if kind in _PHYSICAL:
        return "sensor"
    if kind is None and label not in _BODY_MOTION and label.endswith((" angle", " position", " speed")):
        return "joint encoder"
    return "estimate"


def brain_spec(project: Project, run_name: str, step: int) -> dict[str, Any]:
    """Every observation and action of the brain with its meaning, units and scaling, in network order."""
    world = build_world(project)
    sensors = {sensor.id: sensor for sensor in world.sensors}
    inputs = []
    for item in input_labels(world):
        sensor = sensors.get(item.sensor) if item.sensor else None
        entry: dict[str, Any] = {"index": item.index, "label": item.label}
        if sensor is not None:
            entry |= {"sensor": sensor.id, "kind": sensor.kind, "unit": sensor.unit, "low": sensor.low}
            entry |= {"high": sensor.high, "scale": sensor.scale}
        entry["source"] = _source(item.label, sensor.kind if sensor else None)
        inputs.append(entry)
    outputs = [
        {"index": i, "label": a.label, "actuator": a.id, "low": a.low, "high": a.high, "unit": a.unit}
        for i, a in enumerate(world.actuators)
    ]
    return {
        "format": "onnx",
        "opset": OPSET,
        "input": {"name": INPUT, "dtype": "float32", "shape": ["batch", len(inputs)]},
        "output": {"name": OUTPUT, "dtype": "float32", "shape": ["batch", len(outputs)], "range": [-1.0, 1.0]},
        "rate_hz": 1 / CONTROL_PERIOD,
        "brain": {"run": run_name, "step": step, "task": project.task.family},
        "command": "command = low + (action + 1) / 2 * (high - low), per output",
        "inputs": inputs,
        "outputs": outputs,
    }
