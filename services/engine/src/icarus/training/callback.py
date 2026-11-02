import time

from stable_baselines3.common.callbacks import BaseCallback
from stable_baselines3.common.vec_env import DummyVecEnv

from icarus.contracts.training import LiveViewMode
from icarus.training.copy_envs import CopyProcesses
from icarus.training.live_motion import LiveMotion, frame_rate
from icarus.training.progress import EpisodeTally, RunProgress

SNAPSHOT_PERIOD = 0.2


class TrainingCallback(BaseCallback):
    """Turns PPO's training loop into run files: metrics per rollout, scheduled checkpoints, live copies, stops."""

    def __init__(
        self, progress: RunProgress, geoms: list[str], live_view: LiveViewMode = "realtime", rays: int = 0
    ) -> None:
        super().__init__()
        self.progress = progress
        self.geoms = geoms
        self.live_view: LiveViewMode = live_view
        copies = progress.config.copies
        fps = frame_rate(copies, len(geoms), rays, 1 / SNAPSHOT_PERIOD)
        self._motion = None if live_view == "classic" else LiveMotion(live_view, copies, fps)
        self._total = progress.config.total_steps
        self._marks = [step for step in progress.config.checkpoint_steps if step > 0]
        self._tally = EpisodeTally()
        self._last_snapshot = 0.0
        self._last_end = time.monotonic()
        self._last_end_step = 0

    def _on_training_start(self) -> None:
        self._last_end = time.monotonic()
        self._last_end_step = self.num_timesteps
        if self._motion is not None:
            self._capture([True] * self.progress.config.copies)

    def _on_rollout_start(self) -> None:
        self.progress.set_phase("practicing", self.num_timesteps)

    def _on_step(self) -> bool:
        if self.progress.stopping:
            return False
        infos, dones = self.locals["infos"], self.locals["dones"]
        for info, done in zip(infos, dones, strict=True):
            if done and "episode" in info:
                self._tally.add(info)
        now = time.monotonic()
        if self._motion is not None:
            self._capture(self._motion.record(infos, dones, now))
        while self._marks and self.num_timesteps >= self._marks[0]:
            mark = self._marks.pop(0)
            self.progress.checkpoint(self.model, mark, self.num_timesteps)
            if mark >= self._total:
                # Ending here instead of after the rollout keeps the last checkpoint at the step it is named after.
                return False
        if now - self._last_snapshot >= SNAPSHOT_PERIOD:
            self._last_snapshot = now
            self._snapshot(now)
        return True

    def _capture(self, wanted: list[bool]) -> None:
        """Ask the copies that the live view needs a frame from to capture one on their next step."""
        copies = self.training_env.unwrapped
        if isinstance(copies, CopyProcesses):
            copies.capture = wanted
        elif isinstance(copies, DummyVecEnv):
            for env, capture in zip(copies.envs, wanted, strict=True):
                env.set_wrapper_attr("live_recording", capture)

    def _snapshot(self, now: float) -> None:
        if self._motion is None:
            self.progress.snapshot(self.num_timesteps, self.geoms, self.training_env.env_method("poses"))
            return
        copies = self._motion.newest()
        if copies is not None:
            motion = self._motion.flush(now)
            self.progress.snapshot(self.num_timesteps, self.geoms, copies, self.live_view, motion)

    def _on_rollout_end(self) -> None:
        # End to end, PPO updates and evaluations included, so estimates from it hold for whole runs.
        now = time.monotonic()
        if now > self._last_end:
            self.progress.steps_per_second = (self.num_timesteps - self._last_end_step) / (now - self._last_end)
        self._last_end, self._last_end_step = now, self.num_timesteps
        if not self.progress.stopping and self.progress.folder.stop_requested():
            self.progress.stopping = True
            self.progress.log("Stop requested: finishing the current rollout and saving a final checkpoint")
        # PPO updates the brain from the rollout right after this returns; no step runs until it is done.
        self.progress.phase = "updating"
        self.progress.train_point(self._tally, self.num_timesteps)
        self._tally = EpisodeTally()
