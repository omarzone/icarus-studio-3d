from icarus.contracts.library import RewardTermInfo
from icarus.contracts.properties import PropertySchema
from icarus.contracts.specs import TaskFamily
from icarus.library.properties import choice, number, reference


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
        "A bonus once the agent comes to rest inside the goal zone, by the zone's rules: wholly inside, aligned "
        "and below its stop speed when the zone asks for them.",
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
        "spot_alignment",
        "Line up with the spot",
        "navigation",
        0,
        5,
        2.0,
        "Reward for getting lined up with the goal zone's heading the way its Entry rule asks while getting closer "
        "(lined up counts 1, the wrong way round -1, scaled from nothing 5 m away to full at the goal); it pays the "
        "gain each step, so waiting lined up outside the spot earns nothing. Teaches a vehicle to arrive straight in "
        "a rectangular parking spot instead of across it.",
        version=2,
    ),
    _term(
        "gentle_arrival",
        "Arrive gently",
        "navigation",
        0,
        5,
        2.0,
        "Reward for settling inside the goal zone: braking below 1 m/s inside pays, speeding up or leaving costs the "
        "same, so coming to rest once pays 1 and rocking or lingering earns nothing. Teaches a vehicle to brake and "
        "settle in the spot instead of rolling through it.",
        version=3,
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
    _term(
        "reach_plates",
        "Reach the plates",
        "navigation",
        0,
        100,
        10,
        "A bonus once the floor plates are reached, and the try then ends as a success: any one plate, all of them, "
        "or all in their Order. The goal plates are the target plates, or every plate but start pads when the world "
        "has none; a plate is reached when its trigger holds (touch with its press force, or the center over it). "
        "Setting: mode (any, all or in_order). Replaces the goal zone as what success means.",
    ),
    _term(
        "on_plate",
        "Stand on a plate",
        "navigation",
        0,
        1,
        0.01,
        "Reward each step while a goal plate's trigger holds (the body stands on it). Paid every step: over a 600-step "
        "try 0.01 adds at most 6, below reach_plates, so standing on one plate never beats reaching them all.",
    ),
    _term(
        "plates_pressed",
        "Press new plates",
        "navigation",
        0,
        100,
        5,
        "Reward of 1 each time another goal plate is reached in this try (in order when reach_plates asks for "
        "order), so a body is paid for each plate on the way to all of them.",
    ),
    _term(
        "track_motion",
        "Copy the motion",
        "imitation",
        0,
        10,
        1,
        "Reward each step for how closely the body's limbs point the way the tracked person's limbs point at that "
        "moment of the clip, seen from the video's side: 1 when every tracked limb matches, falling toward 0 as "
        "they turn away (exp of minus the squared angle error over 0.6 rad, averaged over the limbs the video "
        "shows). The clip and the part each limb maps onto live in the task's motion.",
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
    "reach_plates": [choice("mode", "Mode", ["any", "all", "in_order"], "all", hint="Which plates complete the goal")],
}

# Posture and effort do not depend on where the body goes, so a legged body racing to a goal keeps them.
_ALSO_FOR: dict[str, frozenset[TaskFamily]] = {
    "stay_upright": frozenset({"navigation", "imitation"}),
    "fall_penalty": frozenset({"navigation", "imitation"}),
    "energy_cost": frozenset({"navigation", "imitation"}),
    "body_height": frozenset({"navigation", "imitation"}),
    "smooth_actions": frozenset({"navigation", "imitation"}),
    "feet_air_time": frozenset({"navigation"}),
    "joint_limits": frozenset({"navigation", "imitation"}),
    # Plates are places to step on, so a walker racing across them learns them as well as a rover.
    "reach_plates": frozenset({"navigation", "locomotion"}),
    "on_plate": frozenset({"navigation", "locomotion"}),
    "plates_pressed": frozenset({"navigation", "locomotion"}),
}


# The terms without which a family has nothing to learn toward.
CORE_TERMS: dict[TaskFamily, tuple[str, ...]] = {
    "navigation": ("progress_to_goal", "reach_goal"),
    "locomotion": ("forward_progress",),
    "imitation": ("track_motion",),
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
