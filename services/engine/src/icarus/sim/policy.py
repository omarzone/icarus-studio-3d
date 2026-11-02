from typing import Protocol

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
