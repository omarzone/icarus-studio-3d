"""Patterns of copies (duplicate, line, grid, circle, mirror, scatter) expanded into plain create_object operations."""

import math
import random
from dataclasses import dataclass, field
from typing import Annotated, Literal, Self

import mujoco
import numpy as np
from pydantic import BaseModel, ConfigDict, Field, model_validator

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.operations import CreateObject, EditOperation
from icarus.contracts.project import Project
from icarus.contracts.properties import Vector3
from icarus.copilot.building.copies import (
    BuildError,
    Copy,
    Ids,
    Member,
    container_of,
    copy_operations,
    is_free,
    scaled_member,
    tinted,
    with_vectors,
)
from icarus.copilot.building.frames import Placement, placed, placement, rotation_degrees, rotation_matrix, rounded
from icarus.copilot.building.selection import Box, Located, locate, merged
from icarus.design.compiler import CompiledModel
from icarus.design.scene import scene_description

MAX_COPIES = 200
type Axis = Literal["x", "y", "z"]
type Point2 = tuple[float, float]
AXES: dict[str, int] = {"x": 0, "y": 1, "z": 2}


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class _Pattern(_Strict):
    source: str = Field(description="Id of the object to copy; everything inside it is copied too.")
    group: str | None = Field(
        default=None, min_length=1, max_length=80, description="Name of a new group that holds the copies."
    )
    keep_clear: list[str] = Field(
        default=[], max_length=20, description="Object ids or zone names no copy may overlap; such copies are skipped."
    )
    clearance_m: float = Field(default=0.5, ge=0, le=20, description="Extra gap kept around keep_clear.")


class Duplicate(_Pattern):
    kind: Literal["duplicate"]
    offset: Vector3 = Field(description="Where the copy goes relative to the source, in the source's parent frame.")


class Linear(_Pattern):
    kind: Literal["linear"]
    count: int = Field(ge=1, le=MAX_COPIES, description="New copies, the source not counted.")
    offset: Vector3 = Field(description="Step from one copy to the next, in metres.")


class Grid(_Pattern):
    kind: Literal["grid"]
    rows: int = Field(ge=1, le=50, description="Along y.")
    columns: int = Field(ge=1, le=50, description="Along x.")
    spacing: Point2 = Field(description="Metres between columns (x) and rows (y); the source is the first cell.")
    layers: int = Field(default=1, ge=1, le=20, description="Stacked along z, for walls and thick floors of blocks.")
    layer_height: float = Field(default=1.0, gt=0, le=50, description="Metres between layers.")


class Circle(_Pattern):
    kind: Literal["circle"]
    count: int = Field(ge=1, le=MAX_COPIES)
    center: Point2 = Field(description="x, y of the circle's center in the source's parent frame.")
    radius_m: float = Field(gt=0, le=500)
    start_deg: float = Field(default=0, ge=-360, le=360, description="Angle of the first copy; 0 is +x.")
    sweep_deg: float = Field(default=360, gt=0, le=360, description="360 spreads copies all around.")
    facing: Literal["center", "outward", "keep"] = Field(
        default="center", description="center turns each copy's +x side to the center; keep keeps the rotation."
    )


class Mirror(_Pattern):
    kind: Literal["mirror"]
    axis: Axis = Field(description="The axis the mirror plane is perpendicular to.")
    plane_at: float = Field(default=0, ge=-1000, le=1000, description="Where the plane crosses that axis.")


class Jitter(_Strict):
    rotation_deg: float = Field(default=0, ge=0, le=180, description="Each copy turns up to ± this around z.")
    scale: float = Field(default=0, ge=0, le=0.9, description="Each copy is scaled by 1 ± up to this.")
    color: float = Field(default=0, ge=0, le=1, description="Hue and lightness shift; 0.1 is subtle.")


class Area(_Strict):
    min: Point2
    max: Point2

    @model_validator(mode="after")
    def _ordered(self) -> Self:
        if self.min[0] > self.max[0] or self.min[1] > self.max[1]:
            raise ValueError("min must be at most max on x and y")
        return self


class Scatter(_Pattern):
    kind: Literal["scatter"]
    count: int = Field(ge=1, le=MAX_COPIES)
    area: Area = Field(description="Rectangle in the source's parent frame where copies may stand.")
    min_spacing_m: float = Field(default=1.0, ge=0, le=100, description="Least distance between copy centers.")
    seed: int = Field(default=0, ge=0, le=2**31 - 1)
    jitter: Jitter | None = None


type PatternSpec = Annotated[Duplicate | Linear | Grid | Circle | Mirror | Scatter, Field(discriminator="kind")]


@dataclass
class Expansion:
    operations: list[EditOperation]
    created: list[str]
    skipped: int = 0
    notes: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class _Frame:
    """The source's parent frame in the world and the source's footprint, from the compiled scene."""

    origin: np.ndarray
    rotation: np.ndarray
    box: Box | None
    radius: float


def _frame(compiled: CompiledModel, located: dict[str, Located], obj: ObjectSpec) -> _Frame:
    scene = scene_description(compiled, 0)
    parent = next((body for body in scene.bodies if body.name == obj.parent), None)
    origin, rotation = np.zeros(3), np.eye(3)
    if parent is not None:
        origin = np.asarray(parent.position)
        matrix = np.zeros(9)
        mujoco.mju_quat2Mat(matrix, np.asarray(parent.quaternion, dtype=float))
        rotation = matrix.reshape(3, 3)
    box = located[obj.id].box if obj.id in located else None
    radius = max(box.size[0], box.size[1]) / 2 if box else 0.0
    return _Frame(origin, rotation, box, radius)


def _clear_box(project: Project, compiled: CompiledModel, located: dict[str, Located], name: str) -> Box | None:
    """The world box of an object, a whole body or a zone."""
    if name in located and located[name].box is not None:
        return located[name].box
    body = next((item for item in project.bodies if item.id == name), None)
    if body is not None:
        return merged([box for obj in body.objects if (box := located[obj.id].box) is not None])
    zone = next((z for z in scene_description(compiled, 0).zones if name in (z.name, z.object)), None)
    if zone is None:
        return None
    half = np.asarray(zone.size) / 2
    return Box(rounded(np.asarray(zone.position) - half), rounded(np.asarray(zone.position) + half))


def _clear_boxes(
    project: Project, compiled: CompiledModel, located: dict[str, Located], names: list[str], margin: float
) -> list[Box]:
    boxes: list[Box] = []
    for name in names:
        box = _clear_box(project, compiled, located, name)
        if box is None:
            raise BuildError(f"keep_clear names `{name}`, which is no object with a shape, body or zone")
        boxes.append(Box(rounded(np.subtract(box.low, margin)), rounded(np.add(box.high, margin))))
    return boxes


def _overlaps(point: np.ndarray, radius: float, boxes: list[Box]) -> bool:
    for box in boxes:
        dx = max(box.low[0] - point[0], 0.0, point[0] - box.high[0])
        dy = max(box.low[1] - point[1], 0.0, point[1] - box.high[1])
        if math.hypot(dx, dy) < radius:
            return True
    return False


def _yawed(where: Placement, yaw: float) -> Vector3:
    return rotation_degrees(rotation_matrix((0.0, 0.0, yaw)) @ rotation_matrix(where.rotation))


_MIRRORS = {axis: np.diag([-1.0 if i == index else 1.0 for i in range(3)]) for axis, index in AXES.items()}


def _mirrored(where: Placement, flip: np.ndarray, position: Vector3) -> Placement:
    return Placement(position, rotation_degrees(flip @ rotation_matrix(where.rotation) @ flip), where.scale)


def _mirror_member(flip: np.ndarray) -> Member:
    def mirror(obj: ObjectSpec) -> ObjectSpec:
        where = placement(obj)
        moved = placed(obj, _mirrored(where, flip, rounded(flip @ np.asarray(where.position))))
        return with_vectors(moved, "joint", {"anchor": np.diag(flip), "axis": np.diag(flip)})

    return mirror


def _placements(spec: PatternSpec, where: Placement) -> list[Copy]:
    position = np.asarray(where.position)
    match spec:
        case Duplicate(offset=offset):
            return [Copy(Placement(rounded(position + offset), where.rotation, where.scale))]
        case Linear(count=count, offset=offset):
            step = np.asarray(offset)
            return [
                Copy(Placement(rounded(position + k * step), where.rotation, where.scale)) for k in range(1, count + 1)
            ]
        case Grid(rows=rows, columns=columns, spacing=(dx, dy), layers=layers, layer_height=dz):
            cells = [
                (r, c, k) for k in range(layers) for r in range(rows) for c in range(columns) if (r, c, k) != (0, 0, 0)
            ]
            return [
                Copy(Placement(rounded(position + (c * dx, r * dy, k * dz)), where.rotation, where.scale))
                for r, c, k in cells
            ]
        case Circle():
            copies: list[Copy] = []
            full = spec.sweep_deg >= 360
            for k in range(spec.count):
                share = k / spec.count if full else (k / (spec.count - 1) if spec.count > 1 else 0.0)
                angle = spec.start_deg + share * spec.sweep_deg
                theta = math.radians(angle)
                spot = (
                    spec.center[0] + spec.radius_m * math.cos(theta),
                    spec.center[1] + spec.radius_m * math.sin(theta),
                )
                turn = {"center": angle + 180.0, "outward": angle, "keep": None}[spec.facing]
                rotation = where.rotation if turn is None else _yawed(where, turn)
                copies.append(Copy(Placement(rounded((*spot, where.position[2])), rotation, where.scale)))
            return copies
        case Mirror(axis=axis, plane_at=plane):
            flip = _MIRRORS[axis]
            index = AXES[axis]
            spot = position.copy()
            spot[index] = 2 * plane - spot[index]
            return [Copy(_mirrored(where, flip, rounded(spot)), inner=_mirror_member(flip))]
        case Scatter():
            raise AssertionError("scatter is placed with the scene")


def _scatter(spec: Scatter, where: Placement, frame: _Frame, clear: list[Box]) -> tuple[list[Copy], int]:
    rng = random.Random(spec.seed)
    jitter = spec.jitter or Jitter()
    taken: list[np.ndarray] = []
    if frame.box is not None:
        taken.append(np.asarray(frame.box.center))
    copies: list[Copy] = []
    for _ in range(spec.count * 60):
        if len(copies) == spec.count:
            break
        local = np.array(
            [
                rng.uniform(spec.area.min[0], spec.area.max[0]),
                rng.uniform(spec.area.min[1], spec.area.max[1]),
                where.position[2],
            ]
        )
        factor = 1.0 + rng.uniform(-jitter.scale, jitter.scale)
        yaw = rng.uniform(-jitter.rotation_deg, jitter.rotation_deg)
        hue, light = rng.uniform(-jitter.color, jitter.color) * 0.15, rng.uniform(-jitter.color, jitter.color)
        world = _world_center(frame, where, local)
        if any(np.linalg.norm(world[:2] - other[:2]) < spec.min_spacing_m for other in taken):
            continue
        if _overlaps(world, frame.radius * factor, clear):
            continue
        taken.append(world)
        root = Placement(
            rounded(local), _yawed(where, yaw) if yaw else where.rotation, rounded(np.multiply(where.scale, factor))
        )
        each = (lambda obj, h=hue, li=light: tinted(obj, h, li)) if jitter.color else None
        copies.append(Copy(root, each=each, inner=scaled_member(factor) if factor != 1.0 else None))
    return copies, spec.count - len(copies)


def _world_center(frame: _Frame, where: Placement, local: np.ndarray) -> np.ndarray:
    """Where a copy's footprint center lands in the world when its root moves to `local`."""
    shift = frame.rotation @ (local - np.asarray(where.position))
    base = np.asarray(frame.box.center) if frame.box else frame.origin + frame.rotation @ np.asarray(where.position)
    return base + shift


def expand_pattern(project: Project, compiled: CompiledModel | None, spec: PatternSpec, room: int) -> Expansion:
    """The operations of one pattern on this project; `room` is how many operations may still be added."""
    target, objects = container_of(project, spec.source)
    obj = next(item for item in objects if item.id == spec.source)
    where = placement(obj)
    needs_scene = isinstance(spec, Scatter) or bool(spec.keep_clear)
    if needs_scene and compiled is None:
        raise BuildError("The design does not compile, so the scene cannot be measured for this pattern")
    located = {item.obj.id: item for item in locate(project, compiled)} if compiled is not None else {}
    frame = _frame(compiled, located, obj) if compiled is not None else None
    clear: list[Box] = []
    if compiled is not None and spec.keep_clear:
        clear = _clear_boxes(project, compiled, located, spec.keep_clear, spec.clearance_m)
    skipped = 0
    if isinstance(spec, Scatter) and frame is not None:
        copies, skipped = _scatter(spec, where, frame, clear)
    else:
        copies = _placements(spec, where)
        if clear and frame is not None:
            kept = [
                c
                for c in copies
                if not _overlaps(_world_center(frame, where, np.asarray(c.root.position)), frame.radius, clear)
            ]
            skipped, copies = len(copies) - len(kept), kept
    if len(copies) > MAX_COPIES:
        raise BuildError(f"That makes {len(copies)} copies; at most {MAX_COPIES} fit one pattern")
    ids = Ids(project)
    operations: list[EditOperation] = []
    parent = None
    if spec.group is not None:
        if is_free(obj):
            raise BuildError(f"{obj.name} moves freely, so its copies cannot go inside a group; leave group empty")
        group = ObjectSpec(id=ids.fresh(f"{spec.source}_group"), name=spec.group, parent=obj.parent, components=[])
        group = placed(group, Placement((0.0, 0.0, 0.0), (0.0, 0.0, 0.0), (1.0, 1.0, 1.0)))
        operations.append(CreateObject(op="create_object", target=target, object=group))
        parent = group.id
    made, roots = copy_operations(project, spec.source, copies, ids, parent)
    operations += made
    if len(operations) > room:
        size = len(made) // max(len(copies), 1)
        raise BuildError(
            f"The pattern needs {len(operations)} operations ({size} per copy) but only {room} fit; make fewer copies"
        )
    notes = [f"{skipped} copies were skipped: no room clear of keep_clear or the spacing"] if skipped else []
    return Expansion(operations, roots, skipped, notes)
