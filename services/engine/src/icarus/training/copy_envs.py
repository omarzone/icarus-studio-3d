from typing import Any

import gymnasium
import numpy as np
from stable_baselines3.common.vec_env import SubprocVecEnv
from stable_baselines3.common.vec_env.base_vec_env import VecEnv, VecEnvIndices

from icarus.training.copy_process import StartedCopies


class CopyProcesses(SubprocVecEnv):
    """Training copies in their own processes, started with a loop that skips the training stack's imports."""

    def __init__(self, started: StartedCopies) -> None:
        self.waiting = False
        self.closed = False
        self.remotes = started.remotes
        self.processes = started.processes
        self.remotes[0].send(("get_spaces", None))
        observation_space, action_space = self.remotes[0].recv()
        VecEnv.__init__(self, len(self.remotes), observation_space, action_space)
        # Which copies capture a frame for the live view on their next step.
        self.capture = [False] * len(self.remotes)

    def step_async(self, actions: np.ndarray) -> None:
        for remote, action, capture in zip(self.remotes, actions, self.capture, strict=True):
            remote.send(("step_recorded" if capture else "step", action))
        self.waiting = True

    def env_is_wrapped(
        self, wrapper_class: type[gymnasium.Wrapper[Any, Any, Any, Any]], indices: VecEnvIndices = None
    ) -> list[bool]:
        # Sending the wrapper class would make every copy import it, and Stable-Baselines3's pull in torch.
        return [False] * len(self._get_target_remotes(indices))
