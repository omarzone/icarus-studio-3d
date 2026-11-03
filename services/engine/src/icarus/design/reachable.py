"""Whether the goal zone can be reached without a collision wherever randomization puts it, and whether the body
starts clear of every obstacle."""

import itertools
from dataclasses import dataclass
from typing import Literal

import mujoco
import numpy as np

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.project import Project
from icarus.contracts.properties import AssetValue
from icarus.design.compiler import CompiledModel, is_floor_patch, is_ground
from icarus.design.components import view
from icarus.design.course import Extent, geom_extent
from icarus.design.scene import object_extents
from icarus.projects.document import all_objects

Outcome = tuple[Literal["pass", "fail", "skip"], str]
Spread = tuple[float, float]

# Goal positions sampled per axis over its randomization range, corners included, and obstacle positions per axis.
GOAL_GRID = 7
OBSTACLE_GRID = 3
# An obstacle counts when it rises above the goal's floor and starts below what a body passes under, in metres.
RISE = 0.05
HEADROOM = 2.0
# A thin slab this large is ground the body drives on, not an obstacle around the goal.
FLOOR_AREA = 100.0
FLOOR_HEIGHT = 0.5
# The body starts inside an obstacle when their colliders sink into each other deeper than this, in metres.
START_DEPTH = 0.02
# Shares of the goal's randomization range tried, widest first, to suggest one that stays clear.
SAFE_SHARES = (0.75, 0.5, 0.25, 0.1)


@dataclass(frozen=True)
class _Obstacle:
    name: str
    box: Extent
    # How far randomization moves the obstacle and the goal per copy along x and y, leaving out the parents they
    # share: a goal and the cars beside it under one randomized parent move together.
    spread: Spread
    goal_spread: Spread


def _chain(objects: dict[str, ObjectSpec], object_id: str) -> list[str]:
    """The object and its parents in the world, nearest first."""
    chain: list[str] = []
    current: str | None = object_id
    while current is not None and current in objects and current not in chain:
        chain.append(current)
        current = objects[current].parent
    return chain


def _spread(objects: dict[str, ObjectSpec], chain: list[str]) -> Spread:
    x = y = 0.0
    for object_id in chain:
        randomize = view(objects[object_id], "randomize")
        if randomize is not None:
            reach_x, reach_y, _ = randomize.vector("position_range")
            x, y = x + reach_x, y + reach_y
    return x, y


def _carried(project: Project) -> str | None:
    term = next((item for item in project.task.rewards if item.term == "object_to_goal"), None)
    target = term.params.get("object") if term else None
    return target.value if isinstance(target, AssetValue) and target.value else None


def collides(compiled: CompiledModel, geom: int) -> bool:
    model = compiled.model
    solid = bool(model.geom_contype[geom] or model.geom_conaffinity[geom])
    return solid and not is_ground(compiled, geom) and not is_floor_patch(model, geom)


def _is_floor(box: Extent) -> bool:
    size = box.high - box.low
    return float(size[0] * size[1]) >= FLOOR_AREA and float(size[2]) <= FLOOR_HEIGHT


def _obstacles(project: Project, compiled: CompiledModel, data: mujoco.MjData, goal: str, floor: float):
    """Every colliding world object around the goal's height, with its box and how it moves against the goal."""
    model = compiled.model
    objects = {obj.id: obj for obj in project.world.objects}
    skip = {goal, _carried(project)}
    goal_chain = _chain(objects, goal)
    boxes: dict[str, list[Extent]] = {}
    for geom in range(model.ngeom):
        owner = model.body(int(model.geom_bodyid[geom])).name
        if owner in objects and owner not in skip and collides(compiled, geom):
            boxes.setdefault(owner, []).append(geom_extent(model, data, geom))
    found: list[_Obstacle] = []
    for object_id, parts in boxes.items():
        box = Extent(np.min([part.low for part in parts], 0), np.max([part.high for part in parts], 0))
        if box.high[2] <= floor + RISE or box.low[2] >= floor + HEADROOM or _is_floor(box):
            continue
        chain = _chain(objects, object_id)
        own = [item for item in chain if item not in goal_chain]
        goal_own = [item for item in goal_chain if item not in chain]
        found.append(_Obstacle(objects[object_id].name, box, _spread(objects, own), _spread(objects, goal_own)))
    return found


def _offsets(spread: Spread, count: int) -> list[np.ndarray]:
    axes = [np.linspace(-value, value, count) if value > 0 else np.zeros(1) for value in spread]
    return [np.array(pair) for pair in itertools.product(*axes)]


def _gap(point: np.ndarray, box: Extent, shift: np.ndarray) -> float:
    """Horizontal distance from a point to a box moved by shift; negative inside it."""
    low, high = box.low[:2] + shift, box.high[:2] + shift
    outside = np.maximum(np.maximum(low - point, point - high), 0.0)
    if np.any(outside > 0):
        return float(np.linalg.norm(outside))
    return -float(np.min(np.minimum(point - low, high - point)))


@dataclass(frozen=True)
class _Survey:
    # Mean share of copies whose goal is covered, over the goal's sampled positions.
    share: float
    # A covered goal position and the obstacle covering it, when any is.
    example: tuple[np.ndarray, str] | None


def _survey(center: np.ndarray, obstacles: list[_Obstacle], margin: float, goal_scale: float, moves: bool) -> _Survey:
    """Sample the goal over a grid of its range (scaled) and each obstacle over its own, as copies place them."""
    shares: list[float] = []
    example: tuple[np.ndarray, str] | None = None
    for unit in _offsets((1.0, 1.0), GOAL_GRID):
        free = 1.0
        for obstacle in obstacles:
            point = center + unit * np.array(obstacle.goal_spread) * goal_scale
            shifts = _offsets(obstacle.spread, OBSTACLE_GRID) if moves else [np.zeros(2)]
            covering = sum(1 for shift in shifts if _gap(point, obstacle.box, shift) < margin) / len(shifts)
            if covering > 0 and example is None:
                example = (point, obstacle.name)
            free *= 1 - covering
        shares.append(1 - free)
    return _Survey(float(np.mean(shares)), example)


def body_geoms(project: Project, model: mujoco.MjModel) -> list[int]:
    names = {obj.id for body in project.bodies for obj in body.objects}
    return [geom for geom in range(model.ngeom) if model.body(int(model.geom_bodyid[geom])).name in names]


def _half_width(project: Project, compiled: CompiledModel, data: mujoco.MjData, radius: float) -> float:
    """How close to an obstacle the middle of the body can come: half its narrower side, at most the goal radius."""
    geoms = body_geoms(project, compiled.model)
    if not geoms:
        return radius
    parts = [geom_extent(compiled.model, data, geom) for geom in geoms]
    size = np.max([part.high for part in parts], 0) - np.min([part.low for part in parts], 0)
    return min(float(min(size[0], size[1])) / 2, radius)


def goal_object(project: Project) -> ObjectSpec | None:
    """The goal zone's object, in the world or in a body; only a world object's Randomize moves it per copy."""
    return next((obj for obj in all_objects(project) if view(obj, "goal_zone")), None)


def _advice(center: np.ndarray, obstacles: list[_Obstacle], margin: float, spread: Spread) -> str:
    for share in SAFE_SHARES:
        if _survey(center, obstacles, margin, share, True).example is None:
            x, y = spread[0] * share, spread[1] * share
            return f"A goal position range of ±{x:.1f} m on x and ±{y:.1f} m on y stays clear."
    return "Even a much smaller range touches an obstacle: move the goal or the obstacles first."


def _goal_outcome(project: Project, compiled: CompiledModel, data: mujoco.MjData) -> Outcome:
    goal = goal_object(project)
    if goal is None:
        return (
            ("pass", "The body starts clear of every obstacle") if project.bodies else ("skip", "No goal and no body")
        )
    model = compiled.model
    site = int(mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_SITE, f"{goal.id}:goal_zone"))
    center, radius = data.site_xpos[site][:2].copy(), float(model.site_size[site, 0])
    if int(model.site_type[site]) == int(mujoco.mjtGeom.mjGEOM_BOX):
        radius = min(radius, float(model.site_size[site, 1]))
    obstacles = _obstacles(project, compiled, data, goal.id, float(data.site_xpos[site][2]))
    margin = _half_width(project, compiled, data, radius)
    found = _survey(center, obstacles, margin, 1.0, True)
    moving = any(any(item.spread) or any(item.goal_spread) for item in obstacles)
    if found.example is None:
        return "pass", f"{goal.name} is clear of every obstacle" + (" in every copy" if moving else "")
    point, blocker = found.example
    where = f"x {point[0]:.1f}, y {point[1]:.1f}"
    if _survey(center, obstacles, margin, 0.0, False).example is not None:
        return "fail", (
            f"{goal.name} sits inside or against {blocker} at {where}: the body cannot reach it without a collision; "
            "move the goal into free space or move the obstacle"
        )
    spread = max((item.goal_spread for item in obstacles), key=lambda value: value[0] + value[1])
    if not any(spread):
        return "fail", (
            f"Randomization moves {blocker} onto {goal.name} in about {found.share:.0%} of copies, so those episodes "
            f"cannot be won without a collision: keep {blocker}'s position range clear of the goal"
        )
    return "fail", (
        f"{goal.name} is inside or against an obstacle in about {found.share:.0%} of its randomized positions (for "
        f"example {blocker} at {where}), so those episodes cannot be won without a collision. "
        f"{_advice(center, obstacles, margin, spread)} Never randomize a goal into occupied space: when it moves "
        "among bays, move the parked objects with it or pick among free positions."
    )


def _start_outcome(project: Project, compiled: CompiledModel, data: mujoco.MjData) -> str | None:
    """The obstacle the body starts inside, by name, or None."""
    model = compiled.model
    body = set(body_geoms(project, model))
    names = {obj.id: obj.name for obj in project.world.objects}
    for contact in data.contact[: data.ncon]:
        pair = (int(contact.geom1), int(contact.geom2))
        if contact.dist > -START_DEPTH or len(body.intersection(pair)) != 1:
            continue
        other = pair[1] if pair[0] in body else pair[0]
        owner = model.body(int(model.geom_bodyid[other])).name
        if owner in names and collides(compiled, other):
            return names[owner]
    return None


def reachable(project: Project, compiled: CompiledModel) -> Outcome:
    """Fail when the body starts inside an obstacle or the goal zone sits in occupied space anywhere it can be."""
    data = mujoco.MjData(compiled.model)
    mujoco.mj_forward(compiled.model, data)
    blocker = _start_outcome(project, compiled, data)
    if blocker is not None:
        return "fail", f"The body starts inside {blocker}: move the body or {blocker} so they do not overlap"
    too_big = _too_big_for_goal(project, compiled)
    if too_big is not None:
        return "fail", too_big
    return _goal_outcome(project, compiled, data)


def _too_big_for_goal(project: Project, compiled: CompiledModel) -> str | None:
    """Why a goal that must hold the whole body never can, or None when it can."""
    goal = goal_object(project)
    zone = view(goal, "goal_zone") if goal else None
    if goal is None or zone is None or not zone.switch("fully_inside") or not project.bodies:
        return None
    extents = object_extents(compiled, [obj.id for obj in project.bodies[0].objects])
    if extents is None:
        return None
    long, wide = sorted(extents[:2], reverse=True)
    if zone.text("shape") == "rectangle":
        room = sorted((zone.number("length"), zone.number("width")), reverse=True)
        if long <= room[0] and wide <= room[1]:
            return None
        size = f"{room[0]:g} × {room[1]:g} m"
    else:
        if np.hypot(long, wide) <= 2 * zone.number("radius"):
            return None
        size = f"{2 * zone.number('radius'):g} m across"
    return (
        f"The body is {long:.2f} × {wide:.2f} m and must end wholly inside {goal.name}, which is only {size}: "
        "make the goal bigger or turn Fully inside off"
    )
