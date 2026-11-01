import math
from dataclasses import dataclass, field

import mujoco
import numpy as np

from icarus.contracts.project import Project
from icarus.design.compiler import CompiledModel
from icarus.design.components import view

# A world object this long along one side is a lane boundary, not an obstacle on the way.
BOUNDARY_LENGTH = 4.0
POSTURE_TERMS = ("stay_upright", "fall_penalty")
_NONE = -1


@dataclass(frozen=True)
class _Extent:
    low: np.ndarray
    high: np.ndarray


@dataclass
class CourseReport:
    """How the way from the spawn to the finish looks to the body: problems worth a warning and what its rays see."""

    warnings: list[str] = field(default_factory=list)
    # Obstacle ids a distance ray hits from the spawn pose.
    seen: list[str] = field(default_factory=list)


def _extent(model: mujoco.MjModel, data: mujoco.MjData, geom: int) -> _Extent:
    """The world-frame box around one geom at the current pose."""
    rotation = data.geom_xmat[geom].reshape(3, 3)
    half = np.abs(rotation) @ model.geom_size[geom]
    if int(model.geom_type[geom]) in (int(mujoco.mjtGeom.mjGEOM_SPHERE),):
        half = np.full(3, model.geom_size[geom][0])
    elif int(model.geom_type[geom]) in (int(mujoco.mjtGeom.mjGEOM_CYLINDER), int(mujoco.mjtGeom.mjGEOM_CAPSULE)):
        radius, length = model.geom_size[geom][0], model.geom_size[geom][1]
        half = np.abs(rotation) @ np.array([radius, radius, length])
    center = data.geom_xpos[geom]
    return _Extent(center - half, center + half)


def _merged(extents: list[_Extent]) -> _Extent:
    return _Extent(np.min([item.low for item in extents], 0), np.max([item.high for item in extents], 0))


def _object_extents(project: Project, compiled: CompiledModel, data: mujoco.MjData) -> dict[str, _Extent]:
    """World-frame boxes of every world object with solid geoms, by object id."""
    model = compiled.model
    owners = {name: object_id for object_id, name in compiled.objects.items()}
    world = {obj.id for obj in project.world.objects}
    found: dict[str, list[_Extent]] = {}
    for geom in range(model.ngeom):
        if int(model.geom_type[geom]) == int(mujoco.mjtGeom.mjGEOM_PLANE):
            continue
        owner = owners.get(model.body(int(model.geom_bodyid[geom])).name)
        if owner in world:
            found.setdefault(owner, []).append(_extent(model, data, geom))
    return {object_id: _merged(items) for object_id, items in found.items()}


def _lane(project: Project) -> tuple[np.ndarray, np.ndarray, float | None]:
    """The spawn, the unit direction of the way and its length: toward the goal zone when there is one, else +x."""

    def position(kind: str) -> np.ndarray | None:
        for obj in project.world.objects:
            transform = view(obj, "transform")
            if view(obj, kind) and transform:
                return np.array(transform.vector("position")[:2])
        return None

    start = position("spawn_point")
    start = np.zeros(2) if start is None else start
    goal = position("goal_zone")
    if goal is None or np.linalg.norm(goal - start) < 1e-6:
        return start, np.array([1.0, 0.0]), None
    way = goal - start
    return start, way / np.linalg.norm(way), float(np.linalg.norm(way))


def _span(extent: _Extent, start: np.ndarray, axis: np.ndarray) -> tuple[float, float]:
    """The interval a box covers along one horizontal axis measured from the spawn."""
    center = (extent.low[:2] + extent.high[:2]) / 2 - start
    half = (extent.high[:2] - extent.low[:2]) / 2
    middle, reach = float(center @ axis), float(np.abs(axis) @ half)
    return middle - reach, middle + reach


def _body_width(project: Project, compiled: CompiledModel, data: mujoco.MjData, side: np.ndarray) -> float:
    model = compiled.model
    names = {compiled.objects[obj.id] for body in project.bodies for obj in body.objects if obj.id in compiled.objects}
    parts = [
        _extent(model, data, geom)
        for geom in range(model.ngeom)
        if model.body(int(model.geom_bodyid[geom])).name in names
    ]
    if not parts:
        return 0.0
    low, high = _span(_merged(parts), np.zeros(2), side)
    return high - low


def _gap_warnings(
    names: dict[str, str], obstacles: dict[str, _Extent], bounds: dict[str, _Extent], frame: tuple, width: float
) -> list[str]:
    start, along, side = frame
    warnings: list[str] = []
    for object_id, extent in obstacles.items():
        first, last = _span(extent, start, along)
        low, high = _span(extent, start, side)
        if low > 0 or high < 0:
            continue
        # The nearest boundary or other obstacle beside this one, at the same place along the way, on each side.
        walls = [
            _span(other, start, side)
            for other_id, other in {**bounds, **obstacles}.items()
            if other_id != object_id and _overlaps(_span(other, start, along), (first, last))
        ]
        middle = (low + high) / 2
        left = min((wall[0] for wall in walls if wall[0] > middle), default=math.inf)
        right = max((wall[1] for wall in walls if wall[1] < middle), default=-math.inf)
        for gap, word in ((left - high, "left"), (low - right, "right")):
            if gap > width:
                room = "open ground" if math.isinf(gap) else f"a {gap:.2f} m gap"
                warnings.append(
                    f"{names[object_id]} leaves {room} on its {word} and the body is {width:.2f} m wide, so it can "
                    "walk around it instead of jumping or being blocked: make it span the lane"
                )
                break
    return warnings


def _overlaps(first: tuple[float, float], second: tuple[float, float]) -> bool:
    return first[0] < second[1] and second[0] < first[1]


def _ray_sites(project: Project, compiled: CompiledModel) -> list[tuple[int, float]]:
    """Every distance-ray site in the model with its range."""
    sites: list[tuple[int, float]] = []
    for body in project.bodies:
        for obj in body.objects:
            ray = view(obj, "distance_ray")
            if ray is None:
                continue
            for index in range(ray.count("count")):
                sites.append((compiled.model.site(f"{obj.id}:ray{index}").id, ray.number("range")))
    return sites


def _seen(
    compiled: CompiledModel, data: mujoco.MjData, sites: list[tuple[int, float]], obstacles: set[str]
) -> list[str]:
    """Obstacles a ray hits from the current pose, as the rangefinder would: its own body excluded."""
    model = compiled.model
    owners = {name: object_id for object_id, name in compiled.objects.items()}
    hit = np.array([_NONE], dtype=np.int32)
    seen: list[str] = []
    for site, reach in sites:
        origin = data.site_xpos[site].copy()
        direction = data.site_xmat[site].reshape(3, 3)[:, 2].copy()
        distance = mujoco.mj_ray(model, data, origin, direction, None, 1, int(model.site_bodyid[site]), hit)
        if hit[0] == _NONE or distance < 0 or distance > reach:
            continue
        owner = owners.get(model.body(int(model.geom_bodyid[hit[0]])).name)
        if owner in obstacles and owner not in seen:
            seen.append(owner)
    return seen


def course_report(project: Project, compiled: CompiledModel) -> CourseReport:
    """Warnings for obstacles on the way that a body can walk around or cannot see, from the compiled spawn pose."""
    report = CourseReport()
    if not project.bodies:
        return report
    data = mujoco.MjData(compiled.model)
    mujoco.mj_forward(compiled.model, data)
    start, along, length = _lane(project)
    side = np.array([-along[1], along[0]])
    boxes = _object_extents(project, compiled, data)
    names = {obj.id: obj.name for obj in project.world.objects}
    bounds = {key: box for key, box in boxes.items() if max(box.high[:2] - box.low[:2]) >= BOUNDARY_LENGTH}
    obstacles = {}
    for key, box in boxes.items():
        first, last = _span(box, start, along)
        if key not in bounds and last > 0 and (length is None or first < length):
            obstacles[key] = box
    if not obstacles:
        return report
    width = _body_width(project, compiled, data, side)
    report.warnings += _gap_warnings(names, obstacles, bounds, (start, along, side), width)
    sites = _ray_sites(project, compiled)
    if not sites:
        report.warnings.append("The body has no distance ray, so it cannot see the obstacles before it touches them")
        return report
    report.seen = _seen(compiled, data, sites, set(obstacles))
    if not report.seen:
        tallest = max(box.high[2] for box in obstacles.values())
        height = min(float(data.site_xpos[site][2]) for site, _ in sites)
        report.warnings.append(
            f"No distance ray sees an obstacle from the start: the rays leave at {height:.2f} m and the obstacles "
            f"are at most {tallest:.2f} m tall; tilt the rays down (negative tilt) or move them"
        )
    return report


def posture_warning(before: Project, after: Project) -> str | None:
    """A legged body (one with a balance sensor) whose task loses the terms that keep it up, or None."""
    legged = any(view(obj, "balance") for body in after.bodies for obj in body.objects)
    had = {term.term for term in before.task.rewards}
    has = {term.term for term in after.task.rewards}
    lost = [term for term in POSTURE_TERMS if term in had and term not in has]
    if not legged or not lost:
        return None
    return (
        f"The body walks on legs but the task no longer has {' and '.join(lost)}, which only locomotion tasks "
        "can use: nothing now tells it to stay up, so it may learn to throw itself forward and fall"
    )
