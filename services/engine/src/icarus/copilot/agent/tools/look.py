import math
from dataclasses import dataclass, replace
from typing import Literal

from pydantic import Field

from icarus.contracts.properties import Vector3
from icarus.contracts.scene import SceneDescription, SceneZone
from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TurnScope
from icarus.copilot.agent.tools.inspect import compact, known_ids
from icarus.copilot.step_words import step_said
from icarus.design.compiler import CompiledModel, compile_project
from icarus.design.scene import scene_description
from icarus.projects.document import find_object
from icarus.sim.views import BlankPicture, CameraSpec, RenderUnavailable

type View = Literal["front", "back", "left", "right", "top", "three_quarter", "onboard"]

# Azimuth relative to the target's heading and elevation, in degrees; azimuth 0 looks along the heading.
VIEW_ANGLES: dict[str, tuple[float, float]] = {
    "front": (180.0, -15.0),
    "back": (0.0, -15.0),
    "left": (-90.0, -15.0),
    "right": (90.0, -15.0),
    "top": (90.0, -89.0),
    "three_quarter": (-135.0, -30.0),
    "onboard": (0.0, -8.0),
}
VIEW_WORDS = {
    "front": "from the front",
    "back": "from behind",
    "left": "from the left",
    "right": "from the right",
    "top": "from above",
    "three_quarter": "from a three-quarter angle",
    "onboard": "from behind, at its height",
}
ZONE_WORDS = {"spawn_point": "blue", "goal_zone": "green", "zone": "amber"}
ZONE_KINDS = {"spawn_point": "spawn point", "goal_zone": "goal zone", "zone": "zone"}
NEARBY = 10
WHOLE_SCENE = "the whole scene"
WIDTH, HEIGHT = 640, 400
# A contact sheet's cells: two columns up to four views, three beyond.
CELL_WIDTH, CELL_HEIGHT = 480, 300
MAX_SHOTS = 6
COLLIDERS_NOTE = (
    "Colliders mode: only the shapes physics touches are drawn, styles and decoration off: floors gray, static "
    "colliders blue, moving parts orange."
)


class FreeCamera(ToolArgs):
    lookat: Vector3 = Field(description="The point the camera looks at, world frame, metres.")
    distance_m: float = Field(ge=0.3, le=200)
    azimuth_deg: float = Field(ge=-360, le=360, description="World frame: 0 looks along +x, 90 looks along +y.")
    elevation_deg: float = Field(ge=-89, le=89, description="Below zero looks down; -89 is straight down.")
    fov_deg: float | None = Field(default=None, ge=10, le=120, description="Vertical field of view; none is 45.")


class Shot(ToolArgs):
    target: str | None = Field(default=None, description="Object, body or zone to frame; none for the whole scene.")
    view: View = Field(default="three_quarter")
    distance_m: float | None = Field(default=None, ge=0.3, le=60)
    camera: FreeCamera | None = Field(default=None, description="A free camera instead of target and view.")


class LookArgs(ToolArgs):
    target: str | None = Field(
        default=None, description="An object id, a body id or a zone name to frame; none frames the whole scene."
    )
    view: View = Field(default="three_quarter", description="Where the camera stands relative to the target.")
    distance_m: float | None = Field(default=None, ge=0.3, le=60, description="Camera distance; none fits the target.")
    camera: FreeCamera | None = Field(default=None, description="A free camera instead of target, view and distance.")
    shots: list[Shot] = Field(
        default=[], max_length=MAX_SHOTS, description="Several views tiled into one contact sheet; they replace the "
        "single view above. Cells read left to right, then top to bottom.",
    )  # fmt: skip
    mode: Literal["styled", "colliders"] = Field(
        default="styled", description="colliders draws only what physics touches, to check what the body will hit."
    )
    zones: bool = Field(default=True, description="Draw the task's zones as colored translucent shapes.")
    on_try: str | None = Field(default=None, description="A try id: show that candidate instead of the project.")


@dataclass(frozen=True)
class _Box:
    center: tuple[float, float, float]
    size: tuple[float, float, float]


def _box(boxes: list[_Box]) -> _Box | None:
    if not boxes:
        return None
    low = [min(box.center[axis] - box.size[axis] / 2 for box in boxes) for axis in range(3)]
    high = [max(box.center[axis] + box.size[axis] / 2 for box in boxes) for axis in range(3)]
    return _Box(
        (
            round((low[0] + high[0]) / 2, 3),
            round((low[1] + high[1]) / 2, 3),
            round((low[2] + high[2]) / 2, 3),
        ),
        (round(high[0] - low[0], 3), round(high[1] - low[1], 3), round(high[2] - low[2], 3)),
    )


def _body_boxes(scene: SceneDescription) -> dict[str, list[_Box]]:
    """Boxes of each MJCF body's solid geoms in the world frame, at the compiled initial state."""
    boxes: dict[str, list[_Box]] = {}
    for geom in scene.geoms:
        if geom.shape != "plane":
            boxes.setdefault(geom.body, []).append(_Box(geom.position, geom.size))
    return boxes


def _heading(scene: SceneDescription, body: str | None) -> float:
    found = next((item for item in scene.bodies if item.name == body), None)
    if found is None:
        return 0.0
    w, x, y, z = found.quaternion
    return math.degrees(math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)))


def _frame(
    scope: TurnScope, compiled: CompiledModel, scene: SceneDescription, target: str | None
) -> tuple[str, _Box, float] | str:
    """What is framed, its box and its heading in degrees; or why the target is unknown."""
    boxes = _body_boxes(scene)
    zones = {zone.name: zone for zone in scene.zones} | {zone.object: zone for zone in scene.zones}
    project = scope.state.project
    if target is None:
        everything = [box for items in boxes.values() for box in items]
        everything += [_Box(zone.position, zone.size) for zone in scene.zones]
        box = _box(everything)
        return (WHOLE_SCENE, box, 0.0) if box else "The scene has nothing solid to look at"
    body = next((item for item in project.bodies if item.id == target), None)
    names = [compiled.objects[obj.id] for obj in body.objects if obj.id in compiled.objects] if body else []
    if target in compiled.objects:
        names = [compiled.objects[target]]
    box = _box([item for name in names for item in boxes.get(name, [])])
    if box is not None:
        found = find_object(project, target)
        what = body.name if body else found[1].name if found else target
        return what, box, _heading(scene, names[0])
    if target in zones:
        zone = zones[target]
        owner = find_object(project, zone.object)
        named = f"{owner[1].name if owner else zone.object} ({ZONE_KINDS[zone.kind]})"
        return named, _Box(zone.position, zone.size), 0.0
    zone_names = ", ".join(sorted({zone.name for zone in scene.zones}))
    return f"There is no object, body or zone `{target}`. Ids: {known_ids(scope)}. Zones: {zone_names or 'none'}"


def _camera(view: View, distance_m: float | None, box: _Box, heading: float, size: tuple[int, int]) -> CameraSpec:
    azimuth, elevation = VIEW_ANGLES[view]
    extent = max(max(box.size), 0.2)
    distance = distance_m or min(max(2.5 * extent, 0.3), 60.0)
    lookat = box.center
    if view == "onboard":
        distance = distance_m or min(max(1.2 * extent, 0.5), 60.0)
        ahead = math.radians(heading)
        lookat = (box.center[0] + extent * math.cos(ahead), box.center[1] + extent * math.sin(ahead), box.center[2])
    return CameraSpec(lookat, round(distance, 2), heading + azimuth, elevation, *size)


def _free(camera: FreeCamera, size: tuple[int, int]) -> CameraSpec:
    spec = CameraSpec(camera.lookat, camera.distance_m, camera.azimuth_deg, camera.elevation_deg, *size)
    return replace(spec, fov=camera.fov_deg)


def _nearby(compiled: CompiledModel, scene: SceneDescription, box: _Box) -> list[dict[str, object]]:
    """The objects closest to the framed box, in the world frame, so placement can be checked in numbers too."""
    owners = {mjcf: object_id for object_id, mjcf in compiled.objects.items()}
    found: list[tuple[float, dict[str, object]]] = []
    for name, items in _body_boxes(scene).items():
        merged = _box(items)
        if merged is None or name not in owners:
            continue
        gap = math.dist(merged.center, box.center)
        found.append((gap, {"id": owners[name], "center": list(merged.center), "size": list(merged.size)}))
    return [entry for _, entry in sorted(found, key=lambda item: item[0])[:NEARBY]]


def _zone_line(zones: list[SceneZone]) -> str:
    listed = [
        f"{zone.name} ({ZONE_WORDS[zone.kind]}) at {list(zone.position)} size {list(zone.size)}" for zone in zones
    ]
    return "; ".join(listed) or "none"


@dataclass(frozen=True)
class _Planned:
    camera: CameraSpec
    label: str
    facts: dict[str, object]
    # What the camera frames and from where, for the step line; None for a free camera.
    what: str | None
    view: View | None
    box: _Box | None


def _plan(
    scope: TurnScope, compiled: CompiledModel, scene: SceneDescription, shot: Shot, size: tuple[int, int]
) -> _Planned | str:
    if shot.camera is not None:
        camera = _free(shot.camera, size)
        facts: dict[str, object] = {
            "camera": "free",
            "looking_at": list(camera.lookat),
            "distance_m": camera.distance,
            "azimuth_deg": camera.azimuth,
            "elevation_deg": camera.elevation,
            "fov_deg": camera.fov or 45,
        }
        label = f"a free camera looking at {list(camera.lookat)} from {camera.distance:g} m"
        return _Planned(camera, label, facts, None, None, None)
    framed = _frame(scope, compiled, scene, shot.target)
    if isinstance(framed, str):
        return framed
    what, box, heading = framed
    camera = _camera(shot.view, shot.distance_m, box, heading, size)
    looking = [round(v, 2) for v in camera.lookat]
    facts = {
        "framed": what,
        "box": {"center": list(box.center), "size": list(box.size)},
        "camera": {"view": shot.view, "distance_m": camera.distance, "looking_at": looking},
    }
    return _Planned(camera, f"{what} {VIEW_WORDS[shot.view]}", facts, what, shot.view, box)


def _compiled(scope: TurnScope, on_try: str | None) -> CompiledModel | None:
    if on_try:
        tried = scope.tries.get(on_try)
        return tried.compiled if tried is not None else None
    if scope.head_compiled is None:
        scope.head_compiled = compile_project(scope.state.project)
    return scope.head_compiled


def _summary(scope: TurnScope, args: LookArgs, plans: list[_Planned]) -> str:
    tried = step_said("in_try", scope.language) if args.on_try else ""
    if len(plans) > 1:
        summary = step_said("looked_sheet", scope.language, count=len(plans), tried=tried)
    else:
        what = plans[0].what or WHOLE_SCENE
        shown = step_said("whole_scene", scope.language) if what == WHOLE_SCENE else what
        view = step_said(f"view_{plans[0].view}" if plans[0].view else "view_free", scope.language)
        summary = step_said("looked", scope.language, what=shown, tried=tried, view=view)
    return summary + (step_said("colliders_only", scope.language) if args.mode == "colliders" else "")


def _label(plans: list[_Planned], candidate: str, columns: int) -> str:
    if len(plans) == 1:
        return f"{plans[0].label}{candidate}"
    cells = "; ".join(f"{number} {plan.label}" for number, plan in enumerate(plans, start=1))
    return f"{len(plans)} views{candidate} in {columns} columns: {cells}"


def look(scope: TurnScope, args: LookArgs) -> Observation:
    compiled = _compiled(scope, args.on_try)
    if compiled is None:
        text = f"There is no passing try `{args.on_try}` to look at."
        return Observation(text, ok=False, summary=step_said("look_no_try", scope.language))
    scene = scene_description(compiled, scope.state.revision.number)
    shots = args.shots or [Shot(target=args.target, view=args.view, distance_m=args.distance_m, camera=args.camera)]
    size = (WIDTH, HEIGHT) if len(shots) == 1 else (CELL_WIDTH, CELL_HEIGHT)
    plans: list[_Planned] = []
    for shot in shots:
        planned = _plan(scope, compiled, scene, shot, size)
        if isinstance(planned, str):
            return Observation(planned, ok=False, summary=step_said("look_no_target", scope.language))
        plans.append(planned)
    zones = scene.zones if args.zones else []
    colliders = args.mode == "colliders"
    columns = 2 if len(plans) <= 4 else 3
    label = _label(plans, " in the tried change" if args.on_try else "", columns)
    facts: dict[str, object] = plans[0].facts if len(plans) == 1 else {"cells": [plan.facts for plan in plans]}
    first_box = next((plan.box for plan in plans if plan.box is not None), None)
    if first_box is not None:
        facts = {**facts, "nearby_world_frame": _nearby(compiled, scene, first_box)}
    summary = _summary(scope, args, plans)
    described = f"{COLLIDERS_NOTE if colliders else ''} Zones: {_zone_line(zones)}. Facts: {compact(facts)}".strip()
    if not scope.can_see:
        return Observation(f"Described {label} in words (pictures are off). {described}", summary=summary)
    views = scope.services.views
    try:
        if len(plans) == 1:
            png = views.render(compiled, plans[0].camera, zones, timeout=20, colliders=colliders)
        else:
            cameras = [plan.camera for plan in plans]
            png = views.render_sheet(compiled, cameras, zones, columns, timeout=35, colliders=colliders)
    except RenderUnavailable:
        text = f"No picture could be rendered on this machine (no OpenGL); describe it from these facts. {described}"
        return Observation(text, ok=False, summary=step_said("look_no_gl", scope.language))
    except BlankPicture:
        text = (
            "The picture could not be rendered: it came out blank. Do not describe it or guess why; tell the person "
            f"the picture failed and describe the scene only from these facts. {described}"
        )
        return Observation(text, ok=False, summary=step_said("look_blank", scope.language))
    if scope.take_view_slot():
        info = scope.services.attachments.add_bytes(scope.project_id, f"{label[:80]}.png", "image/png", png, "view")
        with scope.guard:
            scope.views.append(info)
    text = f"Rendered {label}. {described}. The picture follows in the next message."
    return Observation(text, image=png, image_label=label[:160], summary=summary)


LOOK = Tool(
    name="look",
    description=(
        "Render the scene with MuJoCo from a camera around an object, a body, a zone or the whole scene, or from a "
        "free camera (lookat, distance, azimuth, elevation, fov), with the task's zones drawn (spawn blue, goal "
        "green, other zones amber), and see the picture. shots tiles up to six views into one contact sheet, such "
        "as top, front and side at once. mode colliders shows only what physics touches. Use on_try to see a tried "
        "change before proposing it. Use it whenever layout, clearances, colors or proportions matter."
    ),
    args=LookArgs,
    step="look",
    effect="read",
    run=look,
    per_turn=4,
    timeout_s=40,
)
