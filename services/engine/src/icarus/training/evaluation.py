import math
from dataclasses import dataclass, field

import numpy as np

from icarus.contracts.project import Project
from icarus.contracts.training import MetricPoint, Rollout, RolloutFrame
from icarus.sim.env import ProjectEnv
from icarus.sim.model_state import LiveWorld, reward_state, touching
from icarus.sim.policy import Policy
from icarus.sim.rewards import RewardState
from icarus.training.episodes import EpisodeRecord

# Evaluation seeds sit apart from training seeds so a checkpoint is never judged on the episodes it trained on.
EVALUATION_SEED = 10_000
# The first evaluation episodes keep their states, so the worker can render pictures of them.
PICTURED_EPISODES = 2


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


def _episode(env: ProjectEnv, policy: Policy, seed: int, index: int, record: bool, keep: bool) -> _Episode:
    world = env.world
    observation, _ = env.reset(seed=seed)
    start = reward_state(world)
    frames: list[RolloutFrame] = []
    times, qpos = [float(world.data.time)], [world.data.qpos.copy()]
    first_touch: str | None = None
    touched: tuple[str, float, int] | None = None
    total, length, info, done, terminated = 0.0, 0, {}, False, False
    while not done:
        observation, reward, terminated, truncated, info = env.step(policy.act(observation).astype(np.float32))
        total += reward
        length += 1
        done = terminated or truncated
        time = float(world.data.time)
        if keep:
            times.append(time)
            qpos.append(world.data.qpos.copy())
        if first_touch is None and (hits := touching(world)):
            other = world.model.geom(min(hits)).name
            name = str(world.object_names.get(other, other))
            first_touch = f"Touched {name} at {time:.1f} s"
            touched = (name, round(time, 2), length)
        if record:
            poses = env.poses()
            frames.append(
                RolloutFrame(time=time, positions=poses.positions, quaternions=poses.quaternions, reward=reward)
            )
    time = float(world.data.time)
    fell = bool(terminated and not info["is_success"])
    if info["is_success"] and world.goal is not None:
        outcome = f"Reached the {_lower_first(world.object_names[world.goal.object])} at {time:.1f} s"
    elif terminated:
        outcome = f"Fell over at {time:.1f} s"
    else:
        outcome = first_touch or "Time ran out"
    end = reward_state(world)
    summary = EpisodeRecord(
        index=index,
        seed=seed,
        success=bool(info["is_success"]),
        fell=fell,
        touched=touched[0] if touched else None,
        touched_at=touched[1] if touched else None,
        seconds=round(time, 2),
        episode_return=float(total),
        start_distance=_distance(start),
        end_distance=_distance(end),
        forward=round(end.position[0] - start.position[0], 3),
    )
    failure = length if fell else (touched[2] if touched else None)
    states = EpisodeStates(times, qpos, failure) if keep else None
    return _Episode(
        total, length, info["is_success"], info["failed"], info["episode_terms"], frames, outcome, summary, states
    )


def evaluate(project: Project, policy: Policy, episodes: int, step: int) -> Evaluation:
    """Run a brain without randomization on seeds EVALUATION_SEED + k, recording the first episode as a rollout,
    every episode as a record and the states of the first PICTURED_EPISODES."""
    env = ProjectEnv(project, randomize=False)
    results = [
        _episode(env, policy, EVALUATION_SEED + k, k, record=k == 0, keep=k < PICTURED_EPISODES)
        for k in range(episodes)
    ]
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
