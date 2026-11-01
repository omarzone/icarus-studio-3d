import time

from stable_baselines3.common.callbacks import BaseCallback

from icarus.training.progress import EpisodeTally, RunProgress

SNAPSHOT_PERIOD = 0.5


class TrainingCallback(BaseCallback):
    """Turns PPO's training loop into run files: metrics per rollout, scheduled checkpoints, live copies, stops."""

    def __init__(self, progress: RunProgress, geoms: list[str]) -> None:
        super().__init__()
        self.progress = progress
        self.geoms = geoms
        self._total = progress.config.total_steps
        self._marks = [step for step in progress.config.checkpoint_steps if step > 0]
        self._tally = EpisodeTally()
        self._last_snapshot = 0.0
        self._last_end = time.monotonic()
        self._last_end_step = 0

    def _on_training_start(self) -> None:
        self._last_end = time.monotonic()
        self._last_end_step = self.num_timesteps

    def _on_step(self) -> bool:
        if self.progress.stopping:
            return False
        for info, done in zip(self.locals["infos"], self.locals["dones"], strict=True):
            if done and "episode" in info:
                self._tally.add(info)
        while self._marks and self.num_timesteps >= self._marks[0]:
            mark = self._marks.pop(0)
            self.progress.checkpoint(self.model, mark, self.num_timesteps)
            if mark >= self._total:
                # Ending here instead of after the rollout keeps the last checkpoint at the step it is named after.
                return False
        now = time.monotonic()
        if now - self._last_snapshot >= SNAPSHOT_PERIOD:
            self._last_snapshot = now
            self.progress.snapshot(self.num_timesteps, self.geoms, self.training_env.env_method("poses"))
        return True

    def _on_rollout_end(self) -> None:
        # End to end, PPO updates and evaluations included, so estimates from it hold for whole runs.
        now = time.monotonic()
        if now > self._last_end:
            self.progress.steps_per_second = (self.num_timesteps - self._last_end_step) / (now - self._last_end)
        self._last_end, self._last_end_step = now, self.num_timesteps
        if not self.progress.stopping and self.progress.folder.stop_requested():
            self.progress.stopping = True
            self.progress.log("Stop requested: finishing the current rollout and saving a final checkpoint")
        self.progress.train_point(self._tally, self.num_timesteps)
        self._tally = EpisodeTally()
