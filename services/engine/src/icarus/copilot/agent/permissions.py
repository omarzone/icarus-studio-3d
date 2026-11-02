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
        "Autonomy: autopilot — apply your passing tries yourself (apply, at most 2 per message) and start training "
        "right after a fix when the person asked you to fix or train; never ask the person to press Apply. A change "
        "you only proposed is applied by the engine when your turn ends."
    ),
}


def permission(tool: str, args: BaseModel, autonomy: Autonomy) -> tuple[Permission, str]:
    """What the mode allows for one call; the table, not the prompt, is what enforces the mode."""
    if autonomy == "autopilot":
        return "allow", ""
    if tool == "apply":
        return "deny", APPLY_DENIED
    # Continuing from the best brain is only asked for by the person (the coach's button), so it starts at once.
    if tool == "train" and getattr(args, "action", None) == "start" and not getattr(args, "continue_from_best", False):
        return "offer", TRAIN_OFFERED
    return "allow", ""
