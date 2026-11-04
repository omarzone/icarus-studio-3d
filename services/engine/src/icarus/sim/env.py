from typing import Any

import gymnasium
import mujoco
import numpy as np
from gymnasium import spaces

from icarus.contracts.project import Project
from icarus.contracts.training import CopyPoses
from icarus.projects.curriculum import stage_project
from icarus.sim.displays import goal_distance
from icarus.sim.model_state import (
    LiveWorld,
    apply_action,
    build_world,
    control_substeps,
    observation,
    reset_world,
    reward_state,
)
from icarus.sim.poses import geom_poses, live_rays, moving_geoms, pose_rows
from icarus.sim.rewards import RewardState, compose
from icarus.sim.signals import scene_signals
from icarus.sim.start_pose import place_start
from icarus.sim.success import task_done
from icarus.sim.variation import WorldVariation

# The task's default try length; each project sets its own in task.episode_seconds.
EPISODE_SECONDS = 30.0


def trainable_world(project: Project) -> LiveWorld:
    """The project's world when it can be trained; otherwise a ValueError that says why."""
    if project.task.family not in ("navigation", "locomotion", "imitation"):
        raise ValueError("Only navigation, locomotion and imitation projects can be trained")
    world = build_world(project)
    if world.agent is None or not world.actuators:
        raise ValueError("The project needs a body with at least one motor")
    return world


class ProjectEnv(gymnasium.Env[np.ndarray, np.ndarray]):
    """One copy of a project as a Gymnasium environment, stepped at the control rate."""

    metadata = {"render_modes": []}

    def __init__(self, project: Project, randomize: bool = False, stage: int = 0) -> None:
        self.project = project
        self.randomize = randomize
        # The curriculum stage the tries practice; set_stage changes it from the next try on.
        self.stage = stage
        self._next_stage = stage
        self._load(stage_project(project, stage))
        size = observation(self.world).shape[0]
        self.observation_space = spaces.Box(-np.inf, np.inf, shape=(size,), dtype=np.float32)
        self.action_space = spaces.Box(-1.0, 1.0, shape=(len(self.world.actuators),), dtype=np.float32)
        # Training turns this on so each step's info carries the pose for the live view; evaluations leave it off.
        self.live_recording = False
        self._episode = 0
        self._start_episode()

    def _load(self, project: Project) -> None:
        self.world = trainable_world(project)
        self.variation = WorldVariation(self.world)
        self._substeps = control_substeps(self.world)
        self._terms = [term.term for term in project.task.rewards]
        self._weights = [term.weight for term in project.task.rewards]
        self._seconds = project.task.episode_seconds
        self._end_on_fall = project.task.end_on_fall
        self._end_on_success = project.task.end_on_success
        self._state = reward_state(self.world)
        self._geoms = sorted(set(moving_geoms(self.world)) | self.variation.moved_geoms)
        self.moving_geoms = [self.world.model.geom(index).name for index in self._geoms]

    def set_stage(self, stage: int) -> None:
        """Practice another curriculum stage from the next try on; the try underway ends in the world it began in."""
        self._next_stage = stage

    def _enter_stage(self) -> None:
        tally = self.world.tally
        self._load(stage_project(self.project, self._next_stage))
        if observation(self.world).shape != self.observation_space.shape:
            raise ValueError("A curriculum stage changed what the brain senses")
        self.world.tally = tally
        self.stage = self._next_stage

    def _start_episode(self) -> None:
        self._episode_terms = dict.fromkeys(self._terms, 0.0)
        self._collided = False
        self._reached = False
        self._fell = False

    @property
    def state(self) -> RewardState:
        """What the reward terms read after the last reset or step."""
        return self._state

    def poses(self) -> CopyPoses:
        """Where this copy's moving geoms are right now, with its goal and light states, for the live view."""
        poses = geom_poses(self.world, self._geoms, rays=True)
        poses.signals = scene_signals(self.world, self._state)
        return poses

    def reset(self, *, seed: int | None = None, options: dict[str, Any] | None = None):
        super().reset(seed=seed)
        if self._next_stage != self.stage:
            self._enter_stage()
        if seed is not None:
            # A seeded reset restarts a cycling start at the seed's spawn point, so fixed seeds give fixed starts.
            self.world.spawn_next = seed
        if self.randomize:
            self.variation.start_copy(self.np_random)
        else:
            self.variation.restore()
            reset_world(self.world)
            place_start(self.world, self.np_random)
        self.world.motion_start = self._motion_start() if self.randomize else 0.0
        self._state = reward_state(self.world)
        self._episode += 1
        self._start_episode()
        self.world.tally.start_try(goal_distance(self._state))
        return observation(self.world), {}

    def _motion_start(self) -> float:
        """Where in the clip a training try starts: half from the beginning, half at a random moment, inside the
        focus when the task practices one moment more; evaluations always start at the beginning."""
        motion = self.world.motion
        if motion is None or self.np_random.random() < 0.5:
            return 0.0
        focus = motion.reference.focus
        low, high = focus if focus else (0.0, max(0.0, 1.0 - 1.0 / motion.duration))
        return float(self.np_random.uniform(low, max(low, high))) * motion.duration

    def _out_of_time(self) -> bool:
        if self.world.motion is not None:
            return self.world.motion_time() >= self.world.motion.duration - 1e-9
        return float(self.world.data.time) >= self._seconds - 1e-9

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
        self.world.tally.episode_return += float(reward)
        reached = task_done(self.world, after)
        if reached and not self._reached:
            self.world.tally.successes += 1
        self._reached = self._reached or reached
        self._fell = self._fell or after.fallen
        terminated = (self._end_on_fall and after.fallen) or (self._end_on_success and reached)
        truncated = self._out_of_time()
        info: dict[str, Any] = {"reward_parts": parts}
        if terminated or truncated:
            info["is_success"] = self._reached
            info["failed"] = not self._reached and (self._fell or self._collided)
            info["fell"] = self._fell
            info["episode_terms"] = dict(self._episode_terms)
            info["stage"] = self.stage
        if self.live_recording:
            rows = pose_rows(self.world, self._geoms)
            time = round(float(self.world.data.time), 3)
            info["live_frame"] = (self._episode, time, rows, live_rays(self.world), scene_signals(self.world, after))
        return observation(self.world), float(reward), terminated, truncated, info
