from typing import Literal

from pydantic import BaseModel

from icarus.contracts.copilot import Autonomy

type Permission = Literal["allow", "deny", "offer"]

APPLY_DENIED = "In ask mode the person applies changes; use propose."
TRAIN_OFFERED = "In ask mode I offer a Train button instead of starting training; it is added under your answer."
AUTONOMY_LINES = {
    "ask": (
        "Autonomy: ask — you may inspect, look, try and propose; the person applies changes and starts training. "
        "Never say you changed the project: say what you propose and that Apply adds it."
    ),
    "autopilot": (
        "Autonomy: autopilot — you may apply changes that passed a try (at most 2 per message) and start training "
        "right after a fix."
    ),
}


def permission(tool: str, args: BaseModel, autonomy: Autonomy) -> tuple[Permission, str]:
    """What the mode allows for one call; the table, not the prompt, is what enforces the mode."""
    if autonomy == "autopilot":
        return "allow", ""
    if tool == "apply":
        return "deny", APPLY_DENIED
    if tool == "train" and getattr(args, "action", None) == "start":
        return "offer", TRAIN_OFFERED
    return "allow", ""
