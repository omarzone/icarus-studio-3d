from dataclasses import dataclass
from typing import Literal

from icarus.sim.model_state import CONTROL_PERIOD
from icarus.training.episodes import INSTANT_SECONDS, instant_share, success_share
from icarus.training.run_store import RunFolder

# design_blocker: the coach's early look found something in the design that keeps the brain from the task.
type WatchRule = Literal["stalled", "reward_hacking", "instant_failures", "goal_held", "design_blocker"]

# Checkpoints a run gets to improve before it counts as stalled, and the evaluations that hold a goal.
WINDOW = 3
HELD = 3
# Smaller gains than these are noise between evaluations, not progress.
SUCCESS_GAIN = 0.05
RETURN_GAIN_SHARE = 0.05
RETURN_GAIN_FLOOR = 0.5
# Before this many steps a rising return without success is ordinary learning, not reward hacking.
HACKING_MIN_STEP = 200_000
INSTANT_LIMIT = 0.8
# A brain that has barely trained still flails and falls at once; only after this many steps is it a design problem.
INSTANT_MIN_STEP = 100_000


@dataclass(frozen=True)
class CheckpointResult:
    """One checkpoint's evaluation as the watch rules read it."""

    step: int
    # Share of episodes that succeeded: reached the goal, or for locomotion walked forward without falling.
    success: float | None
    episode_return: float
    # Share of episodes that ended within the first second without success.
    instant_share: float


@dataclass(frozen=True)
class WatchFinding:
    rule: WatchRule
    # One sentence with the run's own numbers, for the coach and the autopilot log.
    reason: str


def checkpoint_results(folder: RunFolder) -> list[CheckpointResult]:
    """Evaluations of a run in step order, with locomotion success and instant endings from its episode records."""
    results = []
    for point in (point for point in folder.metrics() if point.kind == "eval"):
        episodes = folder.episodes(point.step)
        if episodes is not None and episodes.episodes:
            success, instant = success_share(episodes), instant_share(episodes)
        else:
            success = point.success_rate
            instant = 1.0 if point.episode_length * CONTROL_PERIOD < INSTANT_SECONDS else 0.0
        results.append(CheckpointResult(point.step, success, point.episode_return, instant))
    return results


def _gain(before: float) -> float:
    return max(RETURN_GAIN_SHARE * abs(before), RETURN_GAIN_FLOOR)


def _stalled(results: list[CheckpointResult], goal: float) -> WatchFinding | None:
    if len(results) < WINDOW + 1:
        return None
    before, window = results[:-WINDOW], results[-WINDOW:]
    best_success = max(result.success or 0.0 for result in before)
    best_return = max(result.episode_return for result in before)
    recent_success = max(result.success or 0.0 for result in window)
    recent_return = max(result.episode_return for result in window)
    if recent_success >= goal or recent_success >= best_success + SUCCESS_GAIN:
        return None
    if recent_return >= best_return + _gain(best_return):
        return None
    return WatchFinding(
        "stalled",
        f"Success and return have not improved over the last {WINDOW} checkpoints (steps {window[0].step:,} to "
        f"{window[-1].step:,}): best success {recent_success:.2f} against {best_success:.2f} before, best return "
        f"{recent_return:.2f} against {best_return:.2f} before.",
    )


def _hacking(results: list[CheckpointResult]) -> WatchFinding | None:
    window = results[-WINDOW:]
    if len(window) < WINDOW or window[-1].step < HACKING_MIN_STEP:
        return None
    if any(result.success is None or result.success > 0 for result in window):
        return None
    first, last = window[0].episode_return, window[-1].episode_return
    # Rising means the latest return is the window's highest, not a peak that already fell back.
    if last < first + 2 * _gain(first) or last < max(result.episode_return for result in window):
        return None
    return WatchFinding(
        "reward_hacking",
        f"Return rose from {first:.2f} to {last:.2f} between steps {window[0].step:,} and {window[-1].step:,} while "
        "no evaluation episode succeeded: the brain collects reward without doing the task.",
    )


def _instant(results: list[CheckpointResult]) -> WatchFinding | None:
    last = results[-1]
    if last.step < INSTANT_MIN_STEP or last.instant_share < INSTANT_LIMIT:
        return None
    return WatchFinding(
        "instant_failures",
        f"At step {last.step:,}, {last.instant_share:.0%} of evaluation episodes ended in the first "
        f"{INSTANT_SECONDS:.0f} s without success.",
    )


def _held(results: list[CheckpointResult], goal: float) -> WatchFinding | None:
    window = results[-HELD:]
    if len(window) < HELD or any(result.success is None or result.success < goal for result in window):
        return None
    shares = ", ".join(f"{result.success:.2f}" for result in window if result.success is not None)
    return WatchFinding(
        "goal_held",
        f"Success stayed at or above {goal:.2f} for {HELD} evaluations in a row ({shares}, up to step "
        f"{window[-1].step:,}).",
    )


def watch(results: list[CheckpointResult], goal_success: float) -> list[WatchFinding]:
    """What the evaluations so far say about a run: a goal held ends it well; the other rules flag a run to fix."""
    if not results:
        return []
    held = _held(results, goal_success)
    if held is not None:
        return [held]
    found = [_stalled(results, goal_success), _hacking(results), _instant(results)]
    return [finding for finding in found if finding is not None]


type TrendCall = Literal["early", "improving", "flat"]

# Success gained per 100k steps that still counts as learning worth more steps.
SUCCESS_SLOPE = 0.02


@dataclass(frozen=True)
class Trend:
    call: TrendCall
    # One sentence with the run's numbers: what the curve says about more steps against a fix.
    reason: str


def trend(results: list[CheckpointResult]) -> Trend:
    """Whether more steps should help, from the slope of the last evaluations; a flat curve needs a fix instead."""
    trained = [result for result in results if result.step > 0]
    if len(trained) < 3:
        return Trend("early", "Too few trained checkpoints yet to read the learning curve.")
    first, last = trained[-min(len(trained), WINDOW)], trained[-1]
    span = (last.step - first.step) / 100_000
    success_slope = ((last.success or 0.0) - (first.success or 0.0)) / span if span > 0 else 0.0
    best_before = max(result.episode_return for result in results if result.step < last.step)
    steps = f"steps {first.step:,} to {last.step:,}"
    if success_slope >= SUCCESS_SLOPE:
        return Trend(
            "improving",
            f"Success rose {success_slope:.2f} per 100k steps between {steps}: more steps should help.",
        )
    if last.episode_return >= best_before + _gain(best_before) and (
        (last.success or 0.0) > 0 or last.step < HACKING_MIN_STEP
    ):
        return Trend(
            "improving",
            f"Return reached {last.episode_return:.2f} at step {last.step:,}, above {best_before:.2f} before: the "
            "brain is still learning.",
        )
    return Trend(
        "flat",
        f"Success moved {success_slope:.2f} per 100k steps between {steps} (return {first.episode_return:.2f} to "
        f"{last.episode_return:.2f}): more steps alone are unlikely to help; a fix should.",
    )
