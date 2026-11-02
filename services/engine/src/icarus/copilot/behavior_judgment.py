"""How the coach judges the way a body moves, shared by its quick look and its diagnosis: the words it is given,
the shape of what it reports, and the design area each finding points to."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.coach import CoachFinding, DesignArea
from icarus.library.rewards import REWARD_TERMS

type Behavior = Literal[
    "moves_well",
    "stands_still",
    "crawls_on_knees",
    "hops",
    "drags_a_leg",
    "spins",
    "twitches",
    "falls_forward",
    "falls_backward",
    "uses_part_as_crutch",
    "rolls_or_flips",
    "drifts_sideways",
    "other",
]

# Reward terms that shape a gait, used only when the library has them.
LOCOMOTION_TERMS = ("body_height", "smooth_actions", "feet_air_time", "heading_and_drift", "joint_limits")
# Health facts about the gait, when the worker measured them, and the way their value gets worse: up (1) or down (-1).
GAIT_WORSE: dict[str, int] = {
    "foot_dragged": 1,
    "foot_unused": -1,
    "body_low": -1,
    "hopping": 1,
    "twitching": 1,
    "joints_at_limits": 1,
    "drifting": 1,
}

BEHAVIOR_GUIDE = """Judge HOW the body moves, not only whether it reached the goal: watch the film strip frame by
frame. For a legged body: does it stand on its feet and step with every leg in turn, or crawl on its knees or torso,
hop with all feet together, drag a leg, use a part as a crutch, twitch in place, spin, fall forward or backward,
drift sideways? For wheels or tracks: does it drive smoothly toward the task, or spin, reverse, circle, flip?
Map each behavior to the design part that causes it and say what to change there:
- reward: terms and weights (pay for staying up, smooth actions, lifting the feet, holding the heading; a term that
  pays for the wrong thing; a missing penalty);
- sensors: add one the brain lacks, aim one, change its range;
- body: joint ranges, motor strength or gear, masses, part sizes, foot friction;
- world: obstacles, surfaces, the distance to the goal;
- brain: practice settings (steps, copies, per-copy variation).{terms}{gait}"""


def locomotion_terms() -> list[str]:
    return [term for term in LOCOMOTION_TERMS if term in REWARD_TERMS]


def behavior_guide() -> str:
    """The guide, naming the gait reward terms the library has and the gait facts to read when they are there."""
    available = locomotion_terms()
    terms = (
        f"\nReward terms in the library that shape a gait: {', '.join(available)}; propose them by name for a bad gait."
        if available
        else ""
    )
    gait = (
        "\nWhen the health facts carry gait signals (per-foot contact share, torso height, hopping, twitching, joints "
        "at their limits, sideways drift), read the behavior from them together with the pictures and cite them; "
        "without them, judge from the pictures and the episode records alone."
    )
    return BEHAVIOR_GUIDE.format(terms=terms, gait=gait)


class GaitFinding(BaseModel):
    """One behavior seen in the pictures, with the design part to change for it."""

    model_config = ConfigDict(extra="forbid")

    behavior: Behavior
    seen: str = Field(min_length=1, max_length=160, description="What the pictures or facts show, in words.")
    area: DesignArea = Field(description="reward, sensors, body, world or brain.")
    change: str = Field(default="", max_length=300, description="What to change there; empty for moves_well.")


def coach_findings(findings: list[GaitFinding]) -> list[CoachFinding]:
    """The findings that call for a change, in the shape a message carries."""
    return [
        CoachFinding(area=item.area, behavior=item.seen, change=item.change)
        for item in findings
        if item.behavior != "moves_well" and item.change
    ][:8]
