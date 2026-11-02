from icarus.contracts.library import RewardTermInfo
from icarus.contracts.specs import TaskFamily


def _term(
    term: str,
    label: str,
    family: TaskFamily,
    lo: float,
    hi: float,
    default: float,
    description: str,
    version: int = 1,
):
    return RewardTermInfo(
        term=term,
        version=version,
        label=label,
        family=family,
        weight_min=lo,
        weight_max=hi,
        default_weight=default,
        description=description,
    )


_TERMS = [
    _term(
        "reach_goal",
        "Reach the goal",
        "navigation",
        0,
        100,
        10,
        "A bonus once the agent comes to rest inside the goal zone.",
        version=2,
    ),
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
    _term(
        "fall_penalty",
        "Do not fall",
        "locomotion",
        -100,
        0,
        -10,
        "A penalty when the body falls over.",
        version=2,
    ),
]

REWARD_TERMS: dict[str, RewardTermInfo] = {term.term: term for term in _TERMS}

# Posture and effort do not depend on where the body goes, so a legged body racing to a goal keeps them.
_ALSO_FOR: dict[str, frozenset[TaskFamily]] = {
    "stay_upright": frozenset({"navigation"}),
    "fall_penalty": frozenset({"navigation"}),
    "energy_cost": frozenset({"navigation"}),
}


# The terms without which a family has nothing to learn toward.
CORE_TERMS: dict[TaskFamily, tuple[str, ...]] = {
    "navigation": ("progress_to_goal", "reach_goal"),
    "locomotion": ("forward_progress",),
    "none": (),
}


def term_families(term: str) -> frozenset[TaskFamily]:
    info = REWARD_TERMS.get(term)
    if info is None:
        return frozenset()
    own: frozenset[TaskFamily] = frozenset({info.family})
    return own | _ALSO_FOR.get(term, own)


def term_fits(term: str, family: TaskFamily) -> bool:
    return family in term_families(term)
