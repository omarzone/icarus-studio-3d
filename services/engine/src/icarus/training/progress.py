from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal

import numpy as np

from icarus.contracts.project import Project
from icarus.contracts.training import LogLine, MetricPoint, RunConfig, RunFailure, RunState, TrainingSnapshot
from icarus.sim.policy import CheckpointPolicy
from icarus.training.evaluation import evaluate
from icarus.training.run_store import RunFolder

LOG_DETAIL_LINES = 12

Level = Literal["info", "warn", "error"]


@dataclass
class EpisodeTally:
    """Training episodes finished since the last train metric, read from the copies' final infos."""

    returns: list[float] = field(default_factory=list)
    lengths: list[int] = field(default_factory=list)
    successes: list[bool] = field(default_factory=list)
    failures: list[bool] = field(default_factory=list)
    terms: list[dict[str, float]] = field(default_factory=list)

    def add(self, info: dict[str, Any]) -> None:
        episode = info["episode"]
        self.returns.append(float(episode["r"]))
        self.lengths.append(int(episode["l"]))
        self.successes.append(bool(info.get("is_success", False)))
        self.failures.append(bool(info.get("failed", False)))
        self.terms.append(info.get("episode_terms", {}))

    def metric(self, step: int, elapsed: float, steps_per_second: float, has_goal: bool) -> MetricPoint:
        keys = self.terms[0].keys() if self.terms else []
        return MetricPoint(
            kind="train",
            step=step,
            elapsed=elapsed,
            episode_return=float(np.mean(self.returns)),
            episode_length=float(np.mean(self.lengths)),
            success_rate=float(np.mean(self.successes)) if has_goal else None,
            failure_rate=float(np.mean(self.failures)),
            reward_terms={key: float(np.mean([terms.get(key, 0.0) for terms in self.terms])) for key in keys},
            steps_per_second=steps_per_second,
        )


def _percent(rate: float) -> str:
    return f"{rate * 100:.0f}%"


class RunProgress:
    """What the worker records about a run as it trains: checkpoints, metrics, status, log and live copies."""

    def __init__(self, folder: RunFolder) -> None:
        self.folder = folder
        self.config: RunConfig = folder.config()
        self.project: Project = folder.project()
        self.started_at = folder.stored_status().started_at
        self.has_goal = False
        self.steps_per_second = 0.0
        self.stopping = False
        self._best: tuple[float, float] | None = None
        self._best_step: int | None = None
        self._success_rate: float | None = None
        self._saved: set[int] = set()
        self.last_step = 0
        self._snapshot_warned = False

    def elapsed(self) -> float:
        return max(0.0, (datetime.now(UTC) - self.started_at).total_seconds())

    def log(self, text: str, level: Level = "info") -> None:
        self.folder.append_log(LogLine(elapsed=self.elapsed(), level=level, text=text))

    def write_status(self, state: RunState, step: int, **updates: Any) -> None:
        self.last_step = step
        status = self.folder.stored_status().model_copy(
            update={
                "state": state,
                "step": step,
                "steps_per_second": self.steps_per_second,
                "best_step": self._best_step,
                "success_rate": self._success_rate,
                **updates,
            }
        )
        self.folder.write_status(status)

    @property
    def state(self) -> RunState:
        return "stopping" if self.stopping else "running"

    def has_checkpoint(self, step: int) -> bool:
        return step in self._saved

    def checkpoint(self, model: Any, step: int, model_step: int) -> None:
        """Save the brain at a checkpoint, evaluate it on fixed seeds and record its rollout."""
        model.save(self.folder.checkpoint_path(step))
        self._saved.add(step)
        policy = CheckpointPolicy(model, f"Checkpoint {step}")
        result = evaluate(self.project, policy, self.config.evaluation_episodes, step)
        self.folder.write_rollout(result.rollout)
        self.folder.append_metric(result.metric(step, self.elapsed()))
        rank = (result.success_rate if result.success_rate is not None else 0.0, result.episode_return)
        if self._best is None or rank > self._best:
            self._best, self._best_step = rank, step
        self._success_rate = result.success_rate
        self.has_goal = result.success_rate is not None
        self.write_status(self.state, model_step)
        episodes = self.config.evaluation_episodes
        summary = f"Checkpoint {step:,}: mean return {result.episode_return:.2f} over {episodes} episodes"
        if result.success_rate is not None:
            summary += f", reached the goal in {_percent(result.success_rate)}"
        self.log(f"{summary}, failed in {_percent(result.failure_rate)}")

    def train_point(self, tally: EpisodeTally, step: int) -> None:
        if tally.returns:
            self.folder.append_metric(tally.metric(step, self.elapsed(), self.steps_per_second, self.has_goal))
            self.log(
                f"Step {step:,}: mean return {np.mean(tally.returns):.2f} over {len(tally.returns)} episodes, "
                f"{self.steps_per_second:,.0f} steps/s"
            )
        self.write_status(self.state, step)

    def snapshot(self, step: int, geoms: list[str], copies: list[Any]) -> None:
        # The live view is a preview: a file held open by a reader must never stop training.
        try:
            self.folder.write_snapshot(TrainingSnapshot(step=step, geoms=geoms, copies=copies))
        except OSError as error:
            if not self._snapshot_warned:
                self._snapshot_warned = True
                self.log(f"The live view could not be updated ({error.strerror or error}); training goes on", "warn")

    def finish(self, state: RunState, step: int) -> None:
        self.write_status(state, step, finished_at=datetime.now(UTC))

    def fail(self, reason: str, details: list[str]) -> None:
        self.log(reason, "error")
        lines = [line.text for line in self.folder.log()[-LOG_DETAIL_LINES:]]
        failure = RunFailure(reason=reason, details=[*lines, *details][-LOG_DETAIL_LINES * 2 :])
        self.write_status("failed", self.last_step, finished_at=datetime.now(UTC), failure=failure)
