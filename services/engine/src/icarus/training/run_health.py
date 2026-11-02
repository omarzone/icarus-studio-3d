"""What a run's own files say about it at a checkpoint: log trouble, speed, how episodes end, reward balance.

Every fact is one sentence with the run's numbers, so the coach can cite it and the person can check it. A fact
marked `problem` is a hint that the design may need a change; the coach decides with the pictures.
"""

from collections import Counter
from dataclasses import dataclass
from statistics import mean
from typing import Literal

from icarus.contracts.project import Project
from icarus.contracts.properties import VectorValue
from icarus.contracts.training import LogLine, MetricPoint, RunStatus
from icarus.training.episodes import CheckpointEpisodes
from icarus.training.run_store import RunFolder

type FactKind = Literal[
    "log_error",
    "log_warning",
    "unstable",
    "slow",
    "no_motion",
    "ends_early",
    "touches",
    "reward_dominance",
    "failures_flat",
]

SLOW_STEPS_PER_SECOND = 200
# Metres: an episode that moved less than this toward the goal (or forward) barely moved.
STILL_METRES = 0.1
# An episode that ends before this share of its time without success ended early.
EARLY_END_SHARE = 0.5
EARLY_END_LIMIT = 0.5
# A touched object counts when this share of episodes touched it.
TOUCH_SHARE = 0.25
# Positive terms that each hold at least this share, together holding DOMINANT_SHARE, dominate the reward.
TERM_SHARE = 0.25
DOMINANT_SHARE = 0.5
FLAT_FAILURE = 0.5
FLAT_FAILURE_MIN_STEP = 50_000
# Before this many steps a brain that barely moves or fails is still exploring; later it is a hint of a design issue.
SETTLED_STEP = 100_000
UNSTABLE_WORDS = ("nan", "infinite", "unstable", "diverg", "mjwarn")
SHOWN_LINES = 2
CONSOLE_LINES = 40


@dataclass(frozen=True)
class HealthFact:
    kind: FactKind
    text: str
    problem: bool = False


def _quoted(lines: list[str]) -> str:
    return " | ".join(line[:160] for line in lines[:SHOWN_LINES])


def log_facts(log: list[LogLine], console: list[str]) -> list[HealthFact]:
    """Errors, warnings and signs of numerical trouble in the worker's log and raw console output."""
    facts = []
    errors = [line.text for line in log if line.level == "error"]
    warnings = [line.text for line in log if line.level == "warn"]
    if errors:
        facts.append(HealthFact("log_error", f"The worker log has {len(errors)} error(s): {_quoted(errors)}", True))
    if warnings:
        facts.append(HealthFact("log_warning", f"The worker log has {len(warnings)} warning(s): {_quoted(warnings)}"))
    texts = [line.text for line in log] + console[-CONSOLE_LINES:]
    unstable = [text for text in texts if any(word in text.lower() for word in UNSTABLE_WORDS)]
    if unstable:
        facts.append(
            HealthFact("unstable", f"Signs of an unstable simulation in the output: {_quoted(unstable)}", True)
        )
    return facts


def speed_fact(status: RunStatus) -> HealthFact | None:
    rate = status.steps_per_second
    if status.state != "running" or rate is None or rate <= 0 or rate >= SLOW_STEPS_PER_SECOND or status.step == 0:
        return None
    minutes = (status.total_steps - status.step) / rate / 60
    return HealthFact(
        "slow",
        f"Training runs at {rate:,.0f} steps/s, so the remaining {status.total_steps - status.step:,} steps take "
        f"about {minutes:,.0f} minutes.",
    )


def _position(project: Project | None, name: str) -> tuple[float, float, float] | None:
    if project is None:
        return None
    for item in project.world.objects:
        if item.name != name:
            continue
        for component in item.components:
            value = component.properties.get("position") if component.kind == "transform" else None
            if isinstance(value, VectorValue):
                x, y, z = value.value
                return x, y, z
    return None


def episode_facts(episodes: CheckpointEpisodes, project: Project | None = None) -> list[HealthFact]:
    """How the evaluation episodes of a checkpoint moved and ended."""
    records = episodes.episodes
    if not records:
        return []
    total, step, facts = len(records), episodes.step, []
    settled = step >= SETTLED_STEP
    if episodes.has_goal:
        moved = mean((record.start_distance or 0.0) - (record.end_distance or 0.0) for record in records)
        if moved < STILL_METRES:
            facts.append(
                HealthFact(
                    "no_motion",
                    f"At step {step:,} the episodes got {moved:.2f} m closer to the goal on average.",
                    settled,
                )
            )
    else:
        ahead = mean(record.forward for record in records)
        if abs(ahead) < STILL_METRES:
            facts.append(
                HealthFact("no_motion", f"At step {step:,} the body moved {ahead:.2f} m forward on average.", settled)
            )
    limit = EARLY_END_SHARE * episodes.episode_seconds
    early = [record for record in records if not record.success and record.seconds < limit]
    if len(early) / total >= EARLY_END_LIMIT:
        fell = sum(record.fell for record in early)
        touched = sum(record.touched is not None for record in early)
        seconds = mean(record.seconds for record in early)
        text = (
            f"At step {step:,}, {len(early)} of {total} episodes ended after {seconds:.1f} s on average (of "
            f"{episodes.episode_seconds:.0f} s) without success: {fell} fell, {touched} touched something."
        )
        facts.append(HealthFact("ends_early", text, True))
    touching = [record for record in records if record.touched]
    if touching and len(touching) / total >= TOUCH_SHARE:
        names = []
        for name, count in Counter(record.touched for record in touching).most_common(3):
            at = mean(record.touched_at or 0.0 for record in touching if record.touched == name)
            where = _position(project, name) if name else None
            height = f", which stands at height {where[2]:.2f} m" if where is not None else ""
            names.append(f"{name} in {count} (first at {at:.1f} s on average{height})")
        text = f"At step {step:,}, {len(touching)} of {total} episodes touched an object: {'; '.join(names)}."
        facts.append(HealthFact("touches", text, True))
    return facts


def reward_facts(point: MetricPoint, episodes: CheckpointEpisodes | None = None) -> list[HealthFact]:
    """Terms that make most of an evaluation's reward while the body barely moves and nothing succeeds."""
    terms = point.reward_terms
    records = episodes.episodes if episodes is not None else []
    if not records or point.success_rate or any(record.success for record in records):
        return []
    assert episodes is not None
    if episodes.has_goal:
        moved = mean((r.start_distance or 0.0) - (r.end_distance or 0.0) for r in records)
        without = f"the episodes got only {moved:.2f} m closer to the goal"
    else:
        moved = mean(r.forward for r in records)
        without = f"the body moved only {moved:.2f} m forward"
    total = sum(abs(value) for value in terms.values())
    # Reward that dominates while the body does the task is fine; only reward earned without the task is a problem.
    if total <= 0 or abs(moved) >= STILL_METRES:
        return []
    leading = [(term, value) for term, value in terms.items() if value > 0 and value / total >= TERM_SHARE]
    leading.sort(key=lambda item: -item[1])
    share = sum(value for _, value in leading) / total
    if not leading or share < DOMINANT_SHARE:
        return []
    named = " and ".join(f"{term} ({value:.2f}, {value / total:.0%})" for term, value in leading)
    text = (
        f"At step {point.step:,}, {named} make {share:.0%} of the reward (return {point.episode_return:.2f}) while no "
        f"evaluation episode succeeded and {without}: that reward comes without doing the task"
    )
    return [HealthFact("reward_dominance", f"{text}.", True)]


def failure_trend(evaluations: list[MetricPoint]) -> HealthFact | None:
    """Failures that stay high and are not dropping over the last two evaluations."""
    if len(evaluations) < 2:
        return None
    before, last = evaluations[-2], evaluations[-1]
    if last.step < FLAT_FAILURE_MIN_STEP or before.failure_rate is None or last.failure_rate is None:
        return None
    if last.failure_rate < FLAT_FAILURE or last.failure_rate < before.failure_rate:
        return None
    return HealthFact(
        "failures_flat",
        f"Failures are not dropping: {before.failure_rate:.0%} at step {before.step:,} and {last.failure_rate:.0%} at "
        f"step {last.step:,}.",
        True,
    )


def _console(folder: RunFolder) -> list[str]:
    path = folder.console_path
    if not path.is_file():
        return []
    return path.read_text(encoding="utf-8", errors="replace").splitlines()[-CONSOLE_LINES:]


def run_health(folder: RunFolder, step: int) -> list[HealthFact]:
    """Every fact the run's files support at a checkpoint, the problems first."""
    evaluations = [point for point in folder.metrics() if point.kind == "eval" and point.step <= step]
    point = next((item for item in evaluations if item.step == step), None)
    episodes = folder.episodes(step)
    project = folder.project()
    facts = log_facts(folder.log(), _console(folder))
    if (slow := speed_fact(folder.status())) is not None:
        facts.append(slow)
    if episodes is not None:
        facts += episode_facts(episodes, project)
    if point is not None:
        facts += reward_facts(point, episodes)
    if (flat := failure_trend(evaluations)) is not None:
        facts.append(flat)
    return sorted(facts, key=lambda fact: not fact.problem)
