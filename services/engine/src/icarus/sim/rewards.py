import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass

Vector3 = tuple[float, float, float]

# A navigation agent has reached its goal once it is inside the zone and moving slower than this, in m/s.
STOP_SPEED = 0.2
# Most an object's progress toward the goal pays in one control step, in metres, so a kick or a reset cannot spike it.
OBJECT_STEP_LIMIT = 1.0
# What bringing the object to rest in the goal is worth, in metres of progress.
OBJECT_REST_BONUS = 10.0
# Highest height above the start that height_gain pays for, in metres.
HEIGHT_GAIN_MAX = 1.0


@dataclass(frozen=True)
class RewardState:
    """What the reward terms read about the agent at one control step, in world coordinates."""

    position: Vector3
    # The agent's forward (local x) axis projected on the ground plane.
    forward: tuple[float, float]
    # The z component of the agent's local up axis: 1 upright, 0 on its side, -1 upside down.
    up: float
    goal: Vector3 | None
    goal_radius: float
    colliding: bool
    fallen: bool
    # Sum of squared controls normalized to -1..1.
    effort: float
    # Ground speed of the agent in m/s.
    speed: float
    # The object a task brings to the goal and its ground speed, when the task names one.
    object_position: Vector3 | None = None
    object_speed: float = 0.0
    # Height of the agent's root when the world was built.
    start_height: float = 0.0
    # Grid cells of the ground the agent has entered in this try, when the task counts them.
    visited: int = 0


def _goal_distance(state: RewardState) -> float:
    if state.goal is None:
        return 0.0
    return math.hypot(state.goal[0] - state.position[0], state.goal[1] - state.position[1])


def inside_goal(state: RewardState) -> bool:
    return state.goal is not None and _goal_distance(state) <= state.goal_radius


def parked(state: RewardState) -> bool:
    return inside_goal(state) and state.speed <= STOP_SPEED


def reach_goal(before: RewardState, after: RewardState) -> float:
    return float(parked(after) and not parked(before))


def progress_to_goal(before: RewardState, after: RewardState) -> float:
    return _goal_distance(before) - _goal_distance(after) if after.goal is not None else 0.0


def _object_distance(state: RewardState) -> float | None:
    if state.goal is None or state.object_position is None:
        return None
    return math.hypot(state.goal[0] - state.object_position[0], state.goal[1] - state.object_position[1])


def delivered(state: RewardState) -> bool:
    distance = _object_distance(state)
    return distance is not None and distance <= state.goal_radius and state.object_speed <= STOP_SPEED


def object_to_goal(before: RewardState, after: RewardState) -> float:
    start, end = _object_distance(before), _object_distance(after)
    if start is None or end is None:
        return 0.0
    progress = min(max(start - end, -OBJECT_STEP_LIMIT), OBJECT_STEP_LIMIT)
    return progress + OBJECT_REST_BONUS * float(delivered(after) and not delivered(before))


def coverage(before: RewardState, after: RewardState) -> float:
    return float(min(max(after.visited - before.visited, 0), 1))


def height_gain(before: RewardState, after: RewardState) -> float:
    return min(max(after.position[2] - after.start_height, 0.0), HEIGHT_GAIN_MAX)


def heading_alignment(before: RewardState, after: RewardState) -> float:
    distance = _goal_distance(after)
    if after.goal is None or distance < 1e-9:
        return 0.0
    to_goal = ((after.goal[0] - after.position[0]) / distance, (after.goal[1] - after.position[1]) / distance)
    norm = math.hypot(*after.forward)
    if norm < 1e-9:
        return 0.0
    return (after.forward[0] * to_goal[0] + after.forward[1] * to_goal[1]) / norm


def collision_penalty(before: RewardState, after: RewardState) -> float:
    return float(after.colliding and not before.colliding)


def time_penalty(before: RewardState, after: RewardState) -> float:
    return 1.0


def forward_progress(before: RewardState, after: RewardState) -> float:
    return after.position[0] - before.position[0]


def stay_upright(before: RewardState, after: RewardState) -> float:
    return after.up


def energy_cost(before: RewardState, after: RewardState) -> float:
    return after.effort


def fall_penalty(before: RewardState, after: RewardState) -> float:
    return float(after.fallen and not before.fallen)


# Each term returns an unweighted amount; the sign of a penalty comes from its (negative) weight.
TERM_FUNCTIONS: dict[str, Callable[[RewardState, RewardState], float]] = {
    "reach_goal": reach_goal,
    "progress_to_goal": progress_to_goal,
    "heading_alignment": heading_alignment,
    "collision_penalty": collision_penalty,
    "time_penalty": time_penalty,
    "forward_progress": forward_progress,
    "stay_upright": stay_upright,
    "energy_cost": energy_cost,
    "fall_penalty": fall_penalty,
    "object_to_goal": object_to_goal,
    "coverage": coverage,
    "height_gain": height_gain,
}


def compose(
    terms: Sequence[str], weights: Sequence[float], before: RewardState, after: RewardState
) -> tuple[float, dict[str, float]]:
    """The weighted reward of one transition and each term's weighted part."""
    parts: dict[str, float] = {}
    for term, weight in zip(terms, weights, strict=True):
        function = TERM_FUNCTIONS.get(term)
        if function is None:
            raise ValueError(f"There is no reward term {term!r}")
        parts[term] = weight * function(before, after)
    return sum(parts.values()), parts
