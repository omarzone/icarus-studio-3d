from typing import Any

import gymnasium
import mujoco
import numpy as np
from gymnasium import spaces

from icarus.contracts.project import Project
from icarus.contracts.training import CopyPoses
from icarus.sim.model_state import (
    apply_action,
    build_world,
    control_substeps,
    observation,
    reset_world,
    reward_state,
)
from icarus.sim.poses import geom_poses, moving_geoms
from icarus.sim.rewards import compose, inside_goal

EPISODE_SECONDS = 30.0
FRICTION_SPREAD = 0.2


class ProjectEnv(gymnasium.Env[np.ndarray, np.ndarray]):
    """One copy of a navigation or locomotion project as a Gymnasium environment, stepped at the control rate."""

    metadata = {"render_modes": []}

    def __init__(self, project: Project, randomize: bool = False) -> None:
        if project.task.family not in ("navigation", "locomotion"):
            raise ValueError("Only navigation and locomotion projects can be trained")
        self.world = build_world(project)
        if self.world.agent is None or not self.world.actuators:
            raise ValueError("The project needs a body with at least one motor")
        self.randomize = randomize
        self._base_friction = self.world.model.geom_friction[:, 0].copy()
        self._substeps = control_substeps(self.world)
        self._terms = [term.term for term in project.task.rewards]
        self._weights = [term.weight for term in project.task.rewards]
        size = observation(self.world).shape[0]
        self.observation_space = spaces.Box(-np.inf, np.inf, shape=(size,), dtype=np.float32)
        self.action_space = spaces.Box(-1.0, 1.0, shape=(len(self.world.actuators),), dtype=np.float32)
        self._state = reward_state(self.world)
        self._geoms = moving_geoms(self.world)
        self.moving_geoms = [self.world.model.geom(index).name for index in self._geoms]
        self._start_episode()

    def _start_episode(self) -> None:
        self._episode_terms = dict.fromkeys(self._terms, 0.0)
        self._collided = False

    def poses(self) -> CopyPoses:
        """Where this copy's moving geoms are right now, for the live view of training."""
        return geom_poses(self.world, self._geoms)

    def reset(self, *, seed: int | None = None, options: dict[str, Any] | None = None):
        super().reset(seed=seed)
        model = self.world.model
        if self.randomize:
            spread = self.np_random.uniform(1 - FRICTION_SPREAD, 1 + FRICTION_SPREAD, size=self._base_friction.shape)
            model.geom_friction[:, 0] = self._base_friction * spread
        else:
            model.geom_friction[:, 0] = self._base_friction
        reset_world(self.world)
        self._state = reward_state(self.world)
        self._start_episode()
        return observation(self.world), {}

    def step(self, action: np.ndarray):
        apply_action(self.world, action)
        for _ in range(self._substeps):
            mujoco.mj_step(self.world.model, self.world.data)
        after = reward_state(self.world)
        reward, parts = compose(self._terms, self._weights, self._state, after)
        self._state = after
        for term, part in parts.items():
            self._episode_terms[term] += part
        self._collided = self._collided or after.colliding
        reached = self.world.family == "navigation" and inside_goal(after)
        terminated = after.fallen or reached
        truncated = float(self.world.data.time) >= EPISODE_SECONDS - 1e-9
        info: dict[str, Any] = {"reward_parts": parts}
        if terminated or truncated:
            info["is_success"] = reached
            info["failed"] = not reached and (after.fallen or self._collided)
            info["episode_terms"] = dict(self._episode_terms)
        return observation(self.world), float(reward), terminated, truncated, info
