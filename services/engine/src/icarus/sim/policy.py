from pathlib import Path
from typing import Any, Protocol

import numpy as np

UNTRAINED_BRAIN = "Untrained brain: random actions"


class Policy(Protocol):
    """A brain: one -1..1 action per actuator from an observation."""

    label: str

    def act(self, observation: np.ndarray) -> np.ndarray: ...


class RandomPolicy:
    """The untrained brain: seeded uniform actions within each actuator's range."""

    label = UNTRAINED_BRAIN

    def __init__(self, actions: int, seed: int) -> None:
        self._actions = actions
        self._rng = np.random.default_rng(seed)

    def act(self, observation: np.ndarray) -> np.ndarray:
        return self._rng.uniform(-1.0, 1.0, self._actions)


class Predictor(Protocol):
    """What a Stable-Baselines3 model offers a brain, kept as a protocol so the API never imports torch."""

    def predict(
        self, observation: np.ndarray, state: Any = None, episode_start: Any = None, deterministic: bool = False
    ) -> tuple[np.ndarray, Any]: ...


class CheckpointPolicy:
    """A trained brain: a saved policy network acting deterministically."""

    def __init__(self, model: Predictor, label: str) -> None:
        self._model = model
        self.label = label

    @classmethod
    def load(cls, path: Path, label: str, observation_size: int) -> "CheckpointPolicy":
        from stable_baselines3 import PPO

        model = PPO.load(path, device="cpu")
        shape = model.observation_space.shape
        if shape != (observation_size,):
            raise ValueError(f"The checkpoint expects an observation of {shape}, the body gives {observation_size}")
        return cls(model, label)

    def act(self, observation: np.ndarray) -> np.ndarray:
        action, _ = self._model.predict(observation, deterministic=True)
        return np.asarray(action, dtype=float)
