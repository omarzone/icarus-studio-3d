"""How alike two checkpoints behave on the same behavior test, from their recorded paths and episode numbers."""

import math
from statistics import mean

from icarus.contracts.behavior import BehaviorComparison, BehaviorMatchRow, BehaviorTestResult

# Two values are close when they differ by at most this share of the larger, or by the absolute floor.
CLOSE_SHARE = 0.15
PASSED_FLOOR = 0.2
SECONDS_FLOOR = 1.0
METRES_FLOOR = 0.5


class NotComparable(ValueError):
    pass


def _close(a: float, b: float, floor: float) -> bool:
    return abs(a - b) <= max(floor, CLOSE_SHARE * max(abs(a), abs(b)))


def _row(label: str, unit: str, a: float, b: float, floor: float) -> BehaviorMatchRow:
    return BehaviorMatchRow(label=label, unit=unit, a=round(a, 3), b=round(b, 3), close=_close(a, b, floor))


def path_gap(first: list[tuple[float, float]], second: list[tuple[float, float]]) -> float:
    """Mean distance between two paths sampled at the same interval; a body that ended stays where it ended."""
    count = max(len(first), len(second))
    if count == 0:
        return 0.0

    def at(path: list[tuple[float, float]], index: int) -> tuple[float, float]:
        return path[min(index, len(path) - 1)]

    return mean(math.dist(at(first, index), at(second, index)) for index in range(count))


def compare(a: BehaviorTestResult, b: BehaviorTestResult) -> BehaviorComparison:
    """Both results must come from the same test definition, so their episodes started the same way."""
    if a.test != b.test:
        raise NotComparable("The two results were measured on different test definitions; run the test again")
    if not math.isclose(a.path_interval, b.path_interval, rel_tol=1e-6):
        raise NotComparable("The two runs step at different rates, so their paths cannot be lined up")
    rows = [
        _row("Passed", "%", 100 * a.passed_share, 100 * b.passed_share, 100 * PASSED_FLOOR),
        _row("Episode length", "s", a.mean_seconds, b.mean_seconds, SECONDS_FLOOR),
        _row("Path length", "m", a.mean_path_length, b.mean_path_length, METRES_FLOOR),
        _row("Distance covered", "m", a.mean_displacement, b.mean_displacement, METRES_FLOOR),
        _row("Fell", "%", 100 * a.fall_share, 100 * b.fall_share, 100 * PASSED_FLOOR),
    ]
    if a.mean_end_distance is not None and b.mean_end_distance is not None:
        rows.append(_row("End distance to goal", "m", a.mean_end_distance, b.mean_end_distance, METRES_FLOOR))
    gaps = [path_gap(x.path, y.path) for x, y in zip(a.episodes, b.episodes, strict=True)]
    gap = mean(gaps) if gaps else 0.0
    scale = max(METRES_FLOOR, (a.mean_path_length + b.mean_path_length) / 2)
    return BehaviorComparison(
        test_id=a.test.id,
        a=a,
        b=b,
        rows=rows,
        path_gap=round(gap, 3),
        similarity=round(max(0.0, 1.0 - gap / scale), 3),
    )
