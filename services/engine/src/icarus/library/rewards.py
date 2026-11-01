from icarus.contracts.library import RewardTermInfo
from icarus.contracts.specs import TaskFamily


def _term(term: str, label: str, family: TaskFamily, lo: float, hi: float, default: float, description: str):
    return RewardTermInfo(
        term=term,
        version=1,
        label=label,
        family=family,
        weight_min=lo,
        weight_max=hi,
        default_weight=default,
        description=description,
    )


_TERMS = [
    _term("reach_goal", "Reach the goal", "navigation", 0, 100, 10, "A bonus once the agent is inside the goal zone."),
    _term(
        "progress_to_goal",
        "Progress to the goal",
        "navigation",
        0,
        10,
        1,
        "Reward for every metre the agent gets closer to the goal.",
    ),
    _term(
        "heading_alignment",
        "Face the goal",
        "navigation",
        0,
        5,
        0.2,
        "Reward for pointing toward the goal or the parking direction.",
    ),
    _term(
        "collision_penalty",
        "Avoid collisions",
        "navigation",
        -50,
        0,
        -5,
        "A penalty each time the agent hits something.",
    ),
    _term("time_penalty", "Be quick", "navigation", -1, 0, -0.01, "A small penalty for every step taken."),
    _term(
        "forward_progress",
        "Move forward",
        "locomotion",
        0,
        10,
        1,
        "Reward for the distance the body travels forward.",
    ),
    _term("stay_upright", "Stay upright", "locomotion", 0, 5, 0.5, "Reward for keeping the torso up."),
    _term("energy_cost", "Save energy", "locomotion", -1, 0, -0.001, "A penalty proportional to motor effort."),
    _term("fall_penalty", "Do not fall", "locomotion", -100, 0, -10, "A penalty when the body falls over."),
]

REWARD_TERMS: dict[str, RewardTermInfo] = {term.term: term for term in _TERMS}
