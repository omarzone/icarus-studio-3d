import math
import os
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field

import numpy as np

from icarus.contracts.project import Project
from icarus.contracts.training import MetricPoint, Rollout, RolloutFrame
from icarus.sim.env import ProjectEnv
from icarus.sim.model_state import LiveWorld, reward_state, touching
from icarus.sim.policy import BatchPolicy, Policy
from icarus.sim.rewards import RewardState
from icarus.training.episodes import EpisodeRecord
from icarus.training.gait_signals import GaitMeter, measures_gait

# Evaluation seeds sit apart from training seeds so a checkpoint is never judged on the episodes it trained on.
EVALUATION_SEED = 10_000
# The first evaluation episodes keep their states, so the worker can render pictures of them.
PICTURED_EPISODES = 2
# MuJoCo lets go of Python's lock while it steps, so a few threads step evaluation episodes at once.
EVALUATION_THREADS = max(1, min(8, (os.cpu_count() or 2) - 1))


@dataclass(frozen=True)
class EpisodeStates:
    """MuJoCo positions after reset and after every control step of one episode, for pictures of it."""

    times: list[float]
    qpos: list[np.ndarray]
    # The step at which it touched something or fell, when it did.
    failure_index: int | None


@dataclass(frozen=True)
class Evaluation:
    """Mean results of deterministic episodes on fixed seeds, and the first episode as a rollout."""

    episode_return: float
    episode_length: float
    success_rate: float | None
    failure_rate: float
    reward_terms: dict[str, float]
    rollout: Rollout
    episodes: list[EpisodeRecord] = field(default_factory=list)
    states: list[EpisodeStates] = field(default_factory=list, compare=False)
    world: LiveWorld | None = field(default=None, compare=False)

    def metric(self, step: int, elapsed: float) -> MetricPoint:
        return MetricPoint(
            kind="eval",
            step=step,
            elapsed=elapsed,
            episode_return=self.episode_return,
            episode_length=self.episode_length,
            success_rate=self.success_rate,
            failure_rate=self.failure_rate,
            reward_terms=self.reward_terms,
        )


@dataclass(frozen=True)
class _Episode:
    episode_return: float
    length: int
    success: bool
    failed: bool
    terms: dict[str, float]
    frames: list[RolloutFrame]
    outcome: str
    record: EpisodeRecord
    states: EpisodeStates | None


def _lower_first(text: str) -> str:
    return f"{text[:1].lower()}{text[1:]}"


def _distance(state: RewardState) -> float | None:
    if state.goal is None:
        return None
    return round(math.hypot(state.goal[0] - state.position[0], state.goal[1] - state.position[1]), 3)


class _EpisodeRun:
    """One evaluation episode, stepped from outside so several can advance together."""

    def __init__(self, env: ProjectEnv, seed: int, index: int, record: bool, keep: bool) -> None:
        self.env, self.seed, self.index, self.record, self.keep = env, seed, index, record, keep
        world = env.world
        self.observation, _ = env.reset(seed=seed)
        self.start = reward_state(world)
        self.gait = GaitMeter(world, self.start) if measures_gait(world) else None
        self.frames: list[RolloutFrame] = []
        self.times, self.qpos = [float(world.data.time)], [world.data.qpos.copy()]
        self.first_touch: str | None = None
        self.touched: tuple[str, float, int] | None = None
        self.total, self.length, self.info, self.done, self.terminated = 0.0, 0, {}, False, False

    def advance(self, action: np.ndarray) -> None:
        env, world = self.env, self.env.world
        self.observation, reward, self.terminated, truncated, self.info = env.step(action.astype(np.float32))
        self.total += reward
        self.length += 1
        self.done = self.terminated or truncated
        time = float(world.data.time)
        if self.gait is not None:
            self.gait.add(env.state)
        if self.keep:
            self.times.append(time)
            self.qpos.append(world.data.qpos.copy())
        if self.first_touch is None and (hits := touching(world)):
            other = world.model.geom(min(hits)).name
            name = str(world.object_names.get(other, other))
            self.first_touch = f"Touched {name} at {time:.1f} s"
            self.touched = (name, round(time, 2), self.length)
        if self.record:
            poses = env.poses()
            self.frames.append(
                RolloutFrame(
                    time=time,
                    positions=poses.positions,
                    quaternions=poses.quaternions,
                    reward=reward,
                    signals=poses.signals,
                )
            )

    def result(self) -> _Episode:
        world, info, touched = self.env.world, self.info, self.touched
        time = float(world.data.time)
        fell = bool(self.terminated and not info["is_success"])
        if info["is_success"] and world.goal is not None:
            outcome = f"Reached the {_lower_first(world.object_names[world.goal.object])} at {time:.1f} s"
        elif self.terminated:
            outcome = f"Fell over at {time:.1f} s"
        else:
            outcome = self.first_touch or "Time ran out"
        end = reward_state(world)
        summary = EpisodeRecord(
            index=self.index,
            seed=self.seed,
            success=bool(info["is_success"]),
            fell=fell,
            touched=touched[0] if touched else None,
            touched_at=touched[1] if touched else None,
            seconds=round(time, 2),
            episode_return=float(self.total),
            start_distance=_distance(self.start),
            end_distance=_distance(end),
            forward=round(end.position[0] - self.start.position[0], 3),
            gait=self.gait.result(time) if self.gait is not None else None,
        )
        failure = self.length if fell else (touched[2] if touched else None)
        states = EpisodeStates(self.times, self.qpos, failure) if self.keep else None
        return _Episode(
            self.total,
            self.length,
            info["is_success"],
            info["failed"],
            info["episode_terms"],
            self.frames,
            outcome,
            summary,
            states,
        )


def _actions(policy: Policy, observations: list[np.ndarray]) -> list[np.ndarray]:
    if isinstance(policy, BatchPolicy):
        return list(policy.act_many(np.stack(observations)))
    return [policy.act(observation) for observation in observations]


def evaluate(project: Project, policy: Policy, episodes: int, step: int) -> Evaluation:
    """Run a brain without randomization on seeds EVALUATION_SEED + k, recording the first episode as a rollout,
    every episode as a record and the states of the first PICTURED_EPISODES.

    The episodes advance together: one brain call answers all of them, and MuJoCo steps them on several threads.
    """
    runs = [
        _EpisodeRun(ProjectEnv(project, randomize=False), EVALUATION_SEED + k, k, k == 0, k < PICTURED_EPISODES)
        for k in range(episodes)
    ]
    with ThreadPoolExecutor(max_workers=min(EVALUATION_THREADS, episodes)) as pool:
        active = runs
        while active:
            actions = _actions(policy, [run.observation for run in active])
            list(pool.map(_EpisodeRun.advance, active, actions))
            active = [run for run in active if not run.done]
    results = [run.result() for run in runs]
    env = runs[0].env
    first = results[0]
    terms = {term: float(np.mean([result.terms[term] for result in results])) for term in first.terms}
    return Evaluation(
        episode_return=float(np.mean([result.episode_return for result in results])),
        episode_length=float(np.mean([result.length for result in results])),
        success_rate=float(np.mean([result.success for result in results])) if env.world.goal else None,
        failure_rate=float(np.mean([result.failed for result in results])),
        reward_terms=terms,
        rollout=Rollout(
            step=step,
            seed=EVALUATION_SEED,
            geoms=env.moving_geoms,
            frames=first.frames,
            episode_return=first.episode_return,
            outcome=first.outcome,
        ),
        episodes=[result.record for result in results],
        states=[result.states for result in results if result.states is not None],
        world=env.world,
    )
