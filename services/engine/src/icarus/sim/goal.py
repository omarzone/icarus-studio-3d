"""The goal zone's success rules: inside (by the center or the whole footprint), aligned with the spot's heading
(either way, nose in or back in) and stopped, measured on MuJoCo's state."""

import math
from dataclasses import dataclass
from typing import Literal

import mujoco
import numpy as np

from icarus.contracts.objects import ObjectSpec
from icarus.design.components import view

Entry = Literal["either", "nose_in", "back_in"]
# An alignment tolerance this wide leaves the heading free.
FREE_HEADING = 180.0


@dataclass(frozen=True)
class GoalRules:
    rectangle: bool
    length: float
    width: float
    fully_inside: bool
    # Radians, or None when the heading is free.
    align_within: float | None
    entry: Entry
    stop_speed: float

    @property
    def classic(self) -> bool:
        """A circle reached by the agent's center: inside is measured exactly as it always was."""
        return not self.rectangle and not self.fully_inside


def goal_rules(obj: ObjectSpec) -> GoalRules:
    zone = view(obj, "goal_zone")
    assert zone is not None
    align = zone.number("align_within")
    entry = zone.text("entry")
    return GoalRules(
        rectangle=zone.text("shape") == "rectangle",
        length=zone.number("length"),
        width=zone.number("width"),
        fully_inside=zone.switch("fully_inside"),
        align_within=None if align >= FREE_HEADING else math.radians(align),
        entry="nose_in" if entry == "nose_in" else "back_in" if entry == "back_in" else "either",
        stop_speed=zone.number("stop_speed"),
    )


def footprint(model: mujoco.MjModel, data: mujoco.MjData, agent: int, geoms: frozenset[int]) -> np.ndarray:
    """The four ground corners of the box around the body's geoms, in the agent's frame (x forward, y left)."""
    origin, frame = data.xpos[agent], data.xmat[agent].reshape(3, 3)
    low, high = np.full(2, np.inf), np.full(2, -np.inf)
    for index in geoms:
        if int(model.geom_type[index]) == int(mujoco.mjtGeom.mjGEOM_PLANE):
            continue
        rotation = data.geom_xmat[index].reshape(3, 3)
        center = data.geom_xpos[index] + rotation @ model.geom_aabb[index][:3]
        half = model.geom_aabb[index][3:]
        for signs in np.array(np.meshgrid([-1, 1], [-1, 1], [-1, 1])).T.reshape(-1, 3):
            local = frame.T @ (center + rotation @ (signs * half) - origin)
            low, high = np.minimum(low, local[:2]), np.maximum(high, local[:2])
    if not np.all(np.isfinite(low)):
        return np.zeros((4, 2))
    return np.array([[low[0], low[1]], [low[0], high[1]], [high[0], high[1]], [high[0], low[1]]])


@dataclass(frozen=True)
class GoalCheck:
    inside: bool
    aligned: bool
    # 1 when the heading matches the entry rule exactly, -1 when it is the wrong way round.
    alignment: float


def _wrap(angle: float) -> float:
    return (angle + math.pi) % (2 * math.pi) - math.pi


def check_goal(
    data: mujoco.MjData, site: int, radius: float, rules: GoalRules, agent: int, corners: np.ndarray
) -> GoalCheck:
    origin, frame = data.xpos[agent], data.xmat[agent].reshape(3, 3)
    spot, spot_frame = data.site_xpos[site], data.site_xmat[site].reshape(3, 3)
    points = [origin] if not rules.fully_inside else [origin + frame[:, :2] @ corner for corner in corners]
    local = [spot_frame.T @ (point - spot) for point in points]
    if rules.rectangle:
        inside = all(abs(p[0]) <= rules.length / 2 and abs(p[1]) <= rules.width / 2 for p in local)
    else:
        inside = all(math.hypot(p[0], p[1]) <= radius for p in local)
    error = _wrap(math.atan2(frame[1, 0], frame[0, 0]) - math.atan2(spot_frame[1, 0], spot_frame[0, 0]))
    match rules.entry:
        case "nose_in":
            alignment, off = math.cos(error), abs(error)
        case "back_in":
            alignment, off = -math.cos(error), abs(_wrap(error - math.pi))
        case "either":
            alignment, off = abs(math.cos(error)), min(abs(error), abs(_wrap(error - math.pi)))
    aligned = rules.align_within is None or off <= rules.align_within
    return GoalCheck(inside=inside, aligned=aligned, alignment=alignment)
