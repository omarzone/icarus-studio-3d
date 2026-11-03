"""Where a try can start anywhere on the map: the walkable floor minus every obstacle grown by the body's half width,
away from the goal, and only where a floor-plan path leads to the goal. Built once per compiled world."""

from collections import deque
from dataclasses import dataclass

import mujoco
import numpy as np

from icarus.contracts.project import Project
from icarus.design.compiler import CompiledModel, is_floor_patch, is_ground
from icarus.design.components import ComponentView, view
from icarus.design.course import Extent, geom_extent
from icarus.design.reachable import FLOOR_AREA, HEADROOM, RISE, Outcome, body_geoms, collides, goal_object
from icarus.library.layout_site import FloorPlan, Rect

# Room kept between the grown body and an obstacle, in metres, on top of the body's half width.
MARGIN = 0.3
# Around the world's objects when the floor is an endless plane, in metres.
PLANE_MARGIN = 5.0
# A drawn floor (a layout's lot surface or room floor) is at most this thick and lies on the ground.
SURFACE_THICKNESS = 0.1
# Fewer free places than this, or less free floor, leaves too little to vary starts over.
MIN_PLACES = 3
MIN_AREA = 4.0


@dataclass(frozen=True)
class FreeMap:
    """Centers of the cells a try may start on, the cell side, and the floor they were taken from."""

    places: np.ndarray
    cell: float
    floor: str

    @property
    def area(self) -> float:
        return float(len(self.places)) * self.cell**2

    @property
    def roomy(self) -> bool:
        return len(self.places) >= MIN_PLACES and self.area >= MIN_AREA


def starts_anywhere(spawn: ComponentView) -> bool:
    """Start Anywhere, or Start Area left at its zero size, which would otherwise never move the start."""
    mode = spawn.text("mode")
    width, depth, _ = spawn.vector("area")
    return mode == "anywhere" or (mode == "area" and width <= 0 and depth <= 0)


def _rect(box: Extent) -> Rect:
    return Rect(float(box.low[0]), float(box.low[1]), float(box.high[0]), float(box.high[1]))


def _inset(rect: Rect, amount: float) -> Rect:
    return rect.grown(-amount)


def _span(rects: list[Rect]) -> Rect:
    return Rect(
        min(rect.x0 for rect in rects),
        min(rect.y0 for rect in rects),
        max(rect.x1 for rect in rects),
        max(rect.y1 for rect in rects),
    )


def _centers(plan: FloorPlan) -> tuple[np.ndarray, np.ndarray]:
    xs = plan.bounds.x0 + (np.arange(plan.columns) + 0.5) * plan.cell
    ys = plan.bounds.y0 + (np.arange(plan.rows) + 0.5) * plan.cell
    return np.meshgrid(xs, ys)


def _inside(xs: np.ndarray, ys: np.ndarray, rects: list[Rect]) -> np.ndarray:
    inside = np.zeros(xs.shape, dtype=bool)
    for rect in rects:
        inside |= (xs >= rect.x0) & (xs <= rect.x1) & (ys >= rect.y0) & (ys <= rect.y1)
    return inside


def _flood(open_cells: np.ndarray, seeds: np.ndarray) -> np.ndarray:
    """Every open cell joined to a seed through open neighbours."""
    reached = seeds & open_cells
    rows, columns = open_cells.shape
    queue = deque(zip(*np.nonzero(reached), strict=True))
    while queue:
        row, column = queue.popleft()
        for near in ((row + 1, column), (row - 1, column), (row, column + 1), (row, column - 1)):
            if 0 <= near[0] < rows and 0 <= near[1] < columns and open_cells[near] and not reached[near]:
                reached[near] = True
                queue.append(near)
    return reached


@dataclass(frozen=True)
class _Floor:
    regions: list[Rect]
    height: float
    name: str


def _floor(project: Project, compiled: CompiledModel, data: mujoco.MjData, body: set[int]) -> _Floor:
    """Drawn floors on the ground when the world has them, else the ground slabs, else the area around the objects."""
    model = compiled.model
    names = {obj.id: obj.name for obj in project.world.objects}
    grounds = [geom for geom in range(model.ngeom) if is_ground(compiled, geom)]
    plane = int(mujoco.mjtGeom.mjGEOM_PLANE)
    slabs = [geom_extent(model, data, geom) for geom in grounds if int(model.geom_type[geom]) != plane]
    tops = [float(box.high[2]) for box in slabs]
    tops += [float(data.geom_xpos[geom][2]) for geom in grounds if int(model.geom_type[geom]) == plane]
    height = min(tops) if tops else 0.0
    owned = [
        geom
        for geom in range(model.ngeom)
        if model.body(int(model.geom_bodyid[geom])).name in names
        and geom not in body
        and not is_ground(compiled, geom)
        and not is_floor_patch(model, geom)
        and int(model.geom_type[geom]) != plane
    ]
    surfaces: list[tuple[Rect, str]] = []
    for geom in owned:
        box = geom_extent(model, data, geom)
        size = box.high - box.low
        flat = float(size[2]) <= SURFACE_THICKNESS and abs(float(box.low[2]) - height) <= SURFACE_THICKNESS
        if flat and float(size[0] * size[1]) >= FLOOR_AREA:
            surfaces.append((_rect(box), names[model.body(int(model.geom_bodyid[geom])).name]))
    if surfaces:
        return _Floor([rect for rect, _ in surfaces], height, ", ".join(sorted({name for _, name in surfaces})))
    if slabs:
        return _Floor([_rect(box) for box in slabs], height, "the ground")
    points = [_rect(geom_extent(model, data, geom)) for geom in owned]
    points += [Rect(*site[:2], *site[:2]) for site in data.site_xpos[: model.nsite].tolist()]
    if not points:
        return _Floor([], height, "the ground")
    return _Floor([_span(points).grown(PLANE_MARGIN)], height, "the area around the world's objects")


def _half_width(model: mujoco.MjModel, data: mujoco.MjData, body: set[int]) -> float:
    if not body:
        return 0.3
    parts = [geom_extent(model, data, geom) for geom in body]
    size = np.max([part.high for part in parts], 0) - np.min([part.low for part in parts], 0)
    return float(min(size[0], size[1])) / 2


def free_map(project: Project, compiled: CompiledModel, away: float) -> FreeMap:
    """The free places a try may start on, at least away metres beyond the goal zone's edge."""
    model = compiled.model
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    body = set(body_geoms(project, model))
    floor = _floor(project, compiled, data, body)
    half = _half_width(model, data, body)
    goal = goal_object(project)
    site = int(mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_SITE, f"{goal.id}:goal_zone")) if goal else -1
    radius = reach = 0.0
    if site >= 0:
        radius = float(model.site_size[site, 0])
        reach = radius
        if int(model.site_type[site]) == int(mujoco.mjtGeom.mjGEOM_BOX):
            radius = float(np.hypot(model.site_size[site, 0], model.site_size[site, 1]))
            reach = float(min(model.site_size[site, 0], model.site_size[site, 1]))
    inset = [_inset(rect, half) for rect in floor.regions]
    inset = [rect for rect in inset if rect.x1 > rect.x0 and rect.y1 > rect.y0]
    if not inset:
        return FreeMap(np.zeros((0, 2)), 1.0, floor.name)
    bounds = _span(floor.regions)
    starts = FloorPlan(bounds, half + MARGIN)
    paths = FloorPlan(bounds, min(half, reach) if reach > 0 else half)
    owners = {obj.id for obj in project.world.objects} - {goal.id if goal else ""}
    for geom in range(model.ngeom):
        if model.body(int(model.geom_bodyid[geom])).name not in owners or geom in body or not collides(compiled, geom):
            continue
        box = geom_extent(model, data, geom)
        size = box.high - box.low
        if box.high[2] <= floor.height + RISE or box.low[2] >= floor.height + HEADROOM:
            continue
        if float(size[0] * size[1]) >= FLOOR_AREA and float(size[2]) <= SURFACE_THICKNESS:
            continue
        starts.mark(_rect(box))
        paths.mark(_rect(box))
    xs, ys = _centers(starts)
    free = (starts.blocked == 0) & _inside(xs, ys, inset)
    if site >= 0:
        center = data.site_xpos[site][:2]
        distance = np.hypot(xs - center[0], ys - center[1])
        walkable = (paths.blocked == 0) & _inside(xs, ys, floor.regions)
        seeds = distance <= max(reach, paths.cell)
        if not np.any(seeds & walkable):
            seeds = np.zeros(xs.shape, dtype=bool)
            seeds[paths.cell_of((float(center[0]), float(center[1])))] = True
        free &= _flood(walkable, seeds) & (distance >= radius + away)
    places = np.stack([xs[free], ys[free]], axis=1)
    return FreeMap(places, starts.cell, floor.name)


def spawn_room(project: Project, compiled: CompiledModel) -> Outcome | None:
    """Fail when Start Anywhere finds no free place, or very few, to start on; None when no start draws from it."""
    found = next((obj for obj in project.world.objects if view(obj, "spawn_point")), None)
    spawn = view(found, "spawn_point") if found else None
    if spawn is None or not starts_anywhere(spawn):
        return None
    away = spawn.number("goal_distance")
    room = free_map(project, compiled, away)
    if room.roomy:
        return "pass", f"Starts spread over about {room.area:.0f} m² of free floor on {room.floor}"
    goal = goal_object(project)
    beyond = f" at least {away:g} m from {goal.name} and with a way to it" if goal else ""
    amount = "no free place" if not len(room.places) else f"only about {room.area:.1f} m² of free floor"
    return "fail", (
        f"Start Anywhere finds {amount} on {room.floor}{beyond} once the body's width is kept clear of every "
        "obstacle: make room on the floor, lower Away from goal, or start at a fixed spawn point"
    )
