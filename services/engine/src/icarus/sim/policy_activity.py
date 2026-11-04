from typing import Any

import numpy as np


def hidden_layers(model: Any) -> list[tuple[Any, Any]]:
    """Pairs of (linear, activation) modules of the policy branch of a Stable-Baselines3 model."""
    modules = list(model.policy.mlp_extractor.policy_net)
    return [(modules[i], modules[i + 1]) for i in range(0, len(modules) - 1, 2)]


def forward_activity(model: Any, observed: np.ndarray) -> tuple[list[list[float]], list[float]]:
    """What every hidden neuron and every action output of the policy computes for one observation."""
    import torch

    policy = model.policy
    layers: list[list[float]] = []
    with torch.no_grad():
        tensor, _ = policy.obs_to_tensor(np.asarray(observed, dtype=np.float32))
        signal = policy.extract_features(tensor, policy.pi_features_extractor)
        for linear, act in hidden_layers(model):
            signal = act(linear(signal))
            layers.append([float(value) for value in signal[0]])
        outputs = [float(value) for value in policy.action_net(signal)[0]]
    return layers, outputs
