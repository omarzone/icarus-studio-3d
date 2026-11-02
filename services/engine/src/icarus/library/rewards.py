from icarus.contracts.library import RewardTermInfo
from icarus.contracts.properties import PropertySchema
from icarus.contracts.specs import TaskFamily
from icarus.library.properties import number, reference


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
    _term(
        "object_to_goal",
        "Bring the object to the goal",
        "navigation",
        0,
        10,
        1,
        "Reward for every metre a chosen movable world object gets closer to the goal zone, at most 1 per step, "
        "and a bonus of 10 once it comes to rest inside; the try then ends as a success. Setting: object (the id "
        "of a movable world object, such as a crate or ball piece). The body also observes where that object is.",
    ),
    _term(
        "coverage",
        "Cover new ground",
        "navigation",
        0,
        10,
        1,
        "Reward of 1 each time the agent enters a cell of a grid over the ground that it has not visited yet in "
        "this try, for cleaning or exploring. Setting: cell_size (metres, 0.1 to 5, default 0.5).",
    ),
    _term(
        "height_gain",
        "Gain height",
        "locomotion",
        0,
        5,
        1,
        "Reward each step for how high the body's root is above where it started, up to 1 m, for jumping or "
        "standing up.",
    ),
    _term(
        "body_height",
        "Keep the body's height",
        "locomotion",
        0,
        5,
        0.2,
        "Reward each step for keeping the body's root near a target height: 1 at the target, falling to 0 once the "
        "root is 30% of the target above or below it. Stops a legged body from crawling on its belly or knees. "
        "Setting: height (metres, 0.05 to 5); left unset, the target is the root's height when the world is built, "
        "which is its standing height when the body is designed standing on its feet. Paid every step like "
        "stay_upright, so keep it small next to forward_progress.",
    ),
    _term(
        "smooth_actions",
        "Move smoothly",
        "locomotion",
        -1,
        0,
        -0.05,
        "A penalty each step for how much the brain's commands change from the step before: the mean over motors "
        "of the squared change of each -1 to 1 command, from 0 (steady) up to 4 (full swing from one end to the "
        "other). Removes twitching and jitter in the joints.",
    ),
    _term(
        "feet_air_time",
        "Take real steps",
        "locomotion",
        0,
        5,
        1,
        "Reward each time a foot lands after a real lift-off: its time in the air minus 0.1 s, counting at most "
        "0.5 s, so long strides pay and shuffles shorter than 0.1 s cost a little. Paid only while the body moves "
        "faster than 0.1 m/s, so stamping in place earns nothing. Feet are the parts with a touch sensor; a body "
        "without touch sensors uses the tip of each jointed leg whose lowest point at the start sits within 25% of "
        "the root's height above the body's lowest point. Stops dragged feet and crawling.",
    ),
    _term(
        "heading_and_drift",
        "Walk straight",
        "locomotion",
        -2,
        0,
        -0.1,
        "A penalty each step for turning away from +x, the walking direction (1 minus the cosine of the turn: 0 "
        "facing ahead, 1 sideways, 2 backwards), plus the sideways speed in m/s. Stops a walker that circles, "
        "crabs or veers off.",
    ),
    _term(
        "joint_limits",
        "Stay off the joint limits",
        "locomotion",
        -2,
        0,
        -0.1,
        "A penalty each step equal to the share of the body's limited joints within 5% of either end of their "
        "range, from 0 (none) to 1 (all). Stops locked straight legs and joints slammed against their stops.",
    ),
]

REWARD_TERMS: dict[str, RewardTermInfo] = {term.term: term for term in _TERMS}

# The settings a term reads from its params, with their ranges; a term not listed takes none.
TERM_SETTINGS: dict[str, list[PropertySchema]] = {
    "object_to_goal": [reference("object", "Object", "The movable world object to bring into the goal zone")],
    "coverage": [number("cell_size", "Cell size", "m", 0.1, 5, 0.5, hint="Side of each grid cell on the ground")],
    "body_height": [
        number("height", "Target height", "m", 0.05, 5, 1, hint="Root height to hold; unset uses the standing height")
    ],
}

# Posture and effort do not depend on where the body goes, so a legged body racing to a goal keeps them.
_ALSO_FOR: dict[str, frozenset[TaskFamily]] = {
    "stay_upright": frozenset({"navigation"}),
    "fall_penalty": frozenset({"navigation"}),
    "energy_cost": frozenset({"navigation"}),
    "body_height": frozenset({"navigation"}),
    "smooth_actions": frozenset({"navigation"}),
    "feet_air_time": frozenset({"navigation"}),
    "joint_limits": frozenset({"navigation"}),
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
