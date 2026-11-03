"""Short A/B trials of a stalled run: the same design with more steps against the coach's fix, both continuing from
the same brain on the same seed, judged on the same evaluation seeds."""

from typing import Literal

from icarus.training.run_comparison import RunComparison

# Steps each trial trains: enough for a few evaluations, far below a full run.
TRIAL_STEPS = 100_000
SHOWN_ROWS = ("success_rate", "failure_rate", "episode_length", "best_step", "steps")

type TrialSide = Literal["a", "b"]


def _value(comparison: RunComparison, metric: str, side: TrialSide) -> float | None:
    row = next((row for row in comparison.rows if row.metric == metric), None)
    if row is None:
        return None
    value = row.a if side == "a" else row.b
    return None if value is None else float(value)


def trial_winner(comparison: RunComparison) -> TrialSide:
    """The better trial: more success, then fewer failures; at a tie the fix (b) wins, being the newer design.

    Returns of different revisions come from different rewards, so they never decide.
    """

    def rank(side: TrialSide) -> tuple[float, float]:
        success = _value(comparison, "success_rate", side) or 0.0
        failure = _value(comparison, "failure_rate", side)
        return success, -(failure if failure is not None else 1.0)

    return "a" if rank("a") > rank("b") else "b"


def _cell(value: float | None) -> str:
    if value is None:
        return "—"
    return f"{value:,.0f}" if value.is_integer() and abs(value) >= 10 else f"{value:.2f}"


def trial_table(comparison: RunComparison, names: tuple[str, str]) -> str:
    """The compared rows as a small Markdown table, every number read from the two runs."""
    lines = [f"| | {names[0]} ({comparison.a.name}) | {names[1]} ({comparison.b.name}) |", "|---|---|---|"]
    for metric in SHOWN_ROWS:
        a, b = _value(comparison, metric, "a"), _value(comparison, metric, "b")
        if a is None and b is None:
            continue
        lines.append(f"| {metric} | {_cell(a)} | {_cell(b)} |")
    return "\n".join(lines)
