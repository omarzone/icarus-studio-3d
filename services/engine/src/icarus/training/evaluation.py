from dataclasses import dataclass

import numpy as np

from icarus.contracts.project import Project
from icarus.contracts.training import MetricPoint, Rollout, RolloutFrame
from icarus.sim.env import ProjectEnv
from icarus.sim.model_state import touching
from icarus.sim.policy import Policy

# Evaluation seeds sit apart from training seeds so a checkpoint is never judged on the episodes it trained on.
EVALUATION_SEED = 10_000


@dataclass(frozen=True)
class Evaluation:
    """Mean results of deterministic episodes on fixed seeds, and the first episode as a rollout."""

    episode_return: float
    episode_length: float
    success_rate: float | None
    failure_rate: float
    reward_terms: dict[str, float]
    rollout: Rollout

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


def _lower_first(text: str) -> str:
    return f"{text[:1].lower()}{text[1:]}"


def _episode(env: ProjectEnv, policy: Policy, seed: int, record: bool) -> _Episode:
    world = env.world
    observation, _ = env.reset(seed=seed)
    frames: list[RolloutFrame] = []
    first_touch: str | None = None
    total, length, info, done, terminated = 0.0, 0, {}, False, False
    while not done:
        observation, reward, terminated, truncated, info = env.step(policy.act(observation).astype(np.float32))
        total += reward
        length += 1
        done = terminated or truncated
        time = float(world.data.time)
        if first_touch is None and (hits := touching(world)):
            other = world.model.geom(min(hits)).name
            first_touch = f"Touched {world.object_names.get(other, other)} at {time:.1f} s"
        if record:
            poses = env.poses()
            frames.append(
                RolloutFrame(time=time, positions=poses.positions, quaternions=poses.quaternions, reward=reward)
            )
    time = float(world.data.time)
    if info["is_success"] and world.goal is not None:
        outcome = f"Reached the {_lower_first(world.object_names[world.goal.object])} at {time:.1f} s"
    elif terminated:
        outcome = f"Fell over at {time:.1f} s"
    else:
        outcome = first_touch or "Time ran out"
    return _Episode(total, length, info["is_success"], info["failed"], info["episode_terms"], frames, outcome)


def evaluate(project: Project, policy: Policy, episodes: int, step: int) -> Evaluation:
    """Run a brain without randomization on seeds EVALUATION_SEED + k, recording the first episode."""
    env = ProjectEnv(project, randomize=False)
    results = [_episode(env, policy, EVALUATION_SEED + k, record=k == 0) for k in range(episodes)]
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
    )
