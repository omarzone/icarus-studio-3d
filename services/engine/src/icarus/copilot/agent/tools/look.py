import math
from dataclasses import dataclass
from typing import Literal

from pydantic import Field

from icarus.contracts.scene import SceneDescription, SceneZone
from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TurnScope
from icarus.copilot.agent.tools.inspect import compact, known_ids
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
WIDTH, HEIGHT = 640, 400


class LookArgs(ToolArgs):
    target: str | None = Field(
        default=None, description="An object id, a body id or a zone name to frame; none frames the whole scene."
    )
    view: View = Field(default="three_quarter", description="Where the camera stands relative to the target.")
    distance_m: float | None = Field(default=None, ge=0.3, le=60, description="Camera distance; none fits the target.")
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
        return ("the whole scene", box, 0.0) if box else "The scene has nothing solid to look at"
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


def _camera(args: LookArgs, box: _Box, heading: float) -> CameraSpec:
    azimuth, elevation = VIEW_ANGLES[args.view]
    extent = max(max(box.size), 0.2)
    distance = args.distance_m or min(max(2.5 * extent, 0.3), 60.0)
    lookat = box.center
    if args.view == "onboard":
        distance = args.distance_m or min(max(1.2 * extent, 0.5), 60.0)
        ahead = math.radians(heading)
        lookat = (box.center[0] + extent * math.cos(ahead), box.center[1] + extent * math.sin(ahead), box.center[2])
    return CameraSpec(lookat, round(distance, 2), heading + azimuth, elevation, WIDTH, HEIGHT)


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


def look(scope: TurnScope, args: LookArgs) -> Observation:
    compiled = scope.head_compiled
    if args.on_try:
        tried = scope.tries.get(args.on_try)
        if tried is None or tried.compiled is None:
            return Observation(
                f"There is no passing try `{args.on_try}` to look at.", ok=False, summary="Could not look at the change"
            )
        compiled = tried.compiled
    if compiled is None:
        compiled = scope.head_compiled = compile_project(scope.state.project)
    scene = scene_description(compiled, scope.state.revision.number)
    framed = _frame(scope, compiled, scene, args.target)
    if isinstance(framed, str):
        return Observation(framed, ok=False, summary="Could not find what to look at")
    what, box, heading = framed
    camera = _camera(args, box, heading)
    zones = scene.zones if args.zones else []
    candidate = " in the tried change" if args.on_try else ""
    facts = {
        "framed": what,
        "box": {"center": list(box.center), "size": list(box.size)},
        "camera": {
            "view": args.view,
            "distance_m": camera.distance,
            "looking_at": [round(v, 2) for v in camera.lookat],
        },
        "nearby_world_frame": _nearby(compiled, scene, box),
    }
    label = f"{what}{candidate} {VIEW_WORDS[args.view]}"
    summary = f"Looked at {label}"[:200]
    described = f"Zones: {_zone_line(zones)}. Facts: {compact(facts)}"
    if not scope.can_see:
        return Observation(f"Described {label} in words (pictures are off). {described}", summary=summary)
    try:
        png = scope.services.views.render(compiled, camera, zones, timeout=20)
    except RenderUnavailable:
        return Observation(f"No picture could be rendered on this machine. {described}", summary=summary)
    except BlankPicture:
        text = (
            "The picture could not be rendered: it came out blank. Do not describe it or guess why; tell the person "
            f"the picture failed and describe the scene only from these facts. {described}"
        )
        return Observation(text, ok=False, summary="The picture could not be rendered")
    if scope.take_view_slot():
        info = scope.services.attachments.add_bytes(scope.project_id, f"{label[:80]}.png", "image/png", png, "view")
        with scope.guard:
            scope.views.append(info)
    text = f"Rendered {label} at {camera.distance:g} m. {described}. The picture follows in the next message."
    return Observation(text, image=png, image_label=label, summary=summary)


LOOK = Tool(
    name="look",
    description=(
        "Render the scene with MuJoCo from a camera around an object, a body, a zone or the whole scene, with the "
        "task's zones drawn (spawn blue, goal green, other zones amber), and see the picture. Use on_try to see a "
        "tried change before proposing it. Use it whenever layout, clearances, colors or proportions matter."
    ),
    args=LookArgs,
    step="look",
    effect="read",
    run=look,
    per_turn=4,
    timeout_s=25,
)
