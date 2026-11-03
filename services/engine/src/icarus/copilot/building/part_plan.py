"""Compound objects: any object or body made of many primitives, planned as parts and assembled by the engine."""

import math
from typing import Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.operations import AddBody, CreateObject, EditOperation
from icarus.contracts.project import Project
from icarus.contracts.scene import GeomFinish, GeomStyle
from icarus.contracts.specs import BodySpec
from icarus.copilot.building.copies import Ids
from icarus.copilot.building.frames import Placement, placed, rotation_matrix, wrapped
from icarus.copilot.scratch_plan import PlanJoint, PlanMotor, Shape, Surface
from icarus.design.surfaces import SURFACE_FRICTION
from icarus.library.parts import Part, Raw

PLAN_ID = r"^[a-z][a-z0-9_]{0,23}$"
COLOR = r"^#[0-9a-fA-F]{6}$"
Vector3 = tuple[float, float, float]
MAX_PARTS = 40
# The whole object must fit between a pebble and a large building.
SMALLEST_OBJECT, LARGEST_OBJECT = 0.02, 80.0
# Bulk densities a part may have, in kg/m³: hollow shells (a car body) sit low, solid steel near the top.
LIGHTEST, DENSEST = 5.0, 12_000.0
# A part whose mass is not given weighs as a light hollow shape of its size.
ESTIMATED_DENSITY = 300.0
LIGHTEST_PART, HEAVIEST_BODY = 0.05, 20_000.0


class _Plan(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PartLook(_Plan):
    """How a part is drawn; never physics, except surface, which sets the friction of a part that collides."""

    color: str = Field(pattern=COLOR)
    style: GeomStyle = Field(default="plain", description="Detail drawn inside the shape: wheel, car_body, shell...")
    finish: GeomFinish = Field(default="plain", description="Pattern on the faces: glass for windows, brick, wood...")
    roughness: float = Field(default=0.5, ge=0, le=1, description="0.5 keeps the finish's own; low is shiny.")
    metalness: float = Field(default=0.5, ge=0, le=1)
    emissive: float = Field(default=0, ge=0, le=3, description="Glow in the part's color: lights, screens, lamps.")
    transparency: float = Field(default=0, ge=0, le=1)
    surface: Surface = Field(default="concrete", description="What it is made of; sets friction when it collides.")


class CompoundPart(_Plan):
    id: str = Field(pattern=PLAN_ID)
    name: str = Field(min_length=1, max_length=60)
    parent: str | None = Field(description="Another part's id; null for a root part placed from the object's origin.")
    shape: Shape
    size: Vector3 = Field(
        description="Full x, y, z in metres; cylinders and capsules give (diameter, diameter, length)."
    )
    position: Vector3 = Field(description="From the parent's center, or from the object's origin on the ground.")
    rotation: Vector3 = Field(description="Degrees around x, then y, then z, in the parent's frame.")
    look: PartLook
    collides: bool = Field(description="True for parts physics touches; false for look-only detail (windows, lights).")
    mass: float | None = Field(default=None, gt=0, le=10_000, description="kg, for parts of a body that collide.")
    joint: PlanJoint | None = Field(default=None, description="Only on body parts that move against their parent.")
    motor: PlanMotor | None = Field(default=None, description="Drives this part's hinge or slide joint.")


class CompoundObject(_Plan):
    """Static scenery becomes a group of world objects; a body moves and can learn, with joints and motors."""

    id: str = Field(pattern=PLAN_ID)
    name: str = Field(min_length=1, max_length=60)
    kind: Literal["scenery", "body"]
    position: Vector3 = Field(description="World origin of the object; z = 0 is the ground.")
    heading_deg: float = Field(ge=-360, le=360, description="Turn around z; 0 faces +x.")
    parts: list[CompoundPart] = Field(min_length=1, max_length=MAX_PARTS)


def volume(shape: str, size: Vector3) -> float:
    x, y, z = size
    match shape:
        case "sphere":
            return math.pi / 6 * x**3
        case "cylinder":
            return math.pi / 4 * x * y * z
        case "capsule":
            radius = x / 2
            return math.pi * radius**2 * max(z - x, 0.0) + 4 / 3 * math.pi * radius**3
        case _:
            return x * y * z


def part_mass(part: CompoundPart) -> float:
    if part.mass is not None:
        return part.mass
    return round(min(max(volume(part.shape, part.size) * ESTIMATED_DENSITY, LIGHTEST_PART), 5_000.0), 3)


def _ordered(parts: list[CompoundPart]) -> list[CompoundPart] | None:
    """Parents before children, or None when a parent is missing or the parents loop."""
    placed_ids: set[str] = set()
    ordered: list[CompoundPart] = []
    remaining = list(parts)
    while remaining:
        ready = [part for part in remaining if part.parent is None or part.parent in placed_ids]
        if not ready:
            return None
        ordered += ready
        placed_ids |= {part.id for part in ready}
        remaining = [part for part in remaining if part.id not in placed_ids]
    return ordered


def _world_boxes(compound: CompoundObject, ordered: list[CompoundPart]) -> list[tuple[np.ndarray, np.ndarray]]:
    """Each part's center and axis-aligned half extents in the world, from the object's transform chain."""
    origin = np.array(compound.position, dtype=float)
    frames: dict[str | None, tuple[np.ndarray, np.ndarray]] = {
        None: (origin, rotation_matrix((0.0, 0.0, compound.heading_deg)))
    }
    boxes = []
    for part in ordered:
        center, turn = frames[part.parent]
        mine = turn @ rotation_matrix(part.rotation)
        where = center + turn @ np.array(part.position, dtype=float)
        frames[part.id] = (where, mine)
        half = np.abs(mine) @ (np.array(part.size, dtype=float) / 2)
        boxes.append((where, half))
    return boxes


def compound_problems(compound: CompoundObject) -> list[str]:
    """Why the plan cannot become a sensible object: structure, scale, mass and what may move."""
    problems: list[str] = []
    ids = [part.id for part in compound.parts]
    if len(set(ids)) != len(ids):
        problems.append(f"{compound.name}: part ids repeat")
    ordered = _ordered(compound.parts)
    if ordered is None:
        return [*problems, f"{compound.name}: a part names a parent that is not one of its parts, or parents loop"]
    roots = [part for part in compound.parts if part.parent is None]
    for part in compound.parts:
        if min(part.size) < 0.005 or max(part.size) > 60:
            problems.append(f"{part.name}: each size must be between 0.005 and 60 m, not {list(part.size)}")
        if part.motor and not part.joint:
            problems.append(f"{part.name}: a motor needs a hinge or slide joint on the same part")
        if part.motor and part.joint and part.joint.kind == "ball":
            problems.append(f"{part.name}: a ball joint turns freely and cannot carry a motor")
    if compound.kind == "scenery":
        moving = [part.name for part in compound.parts if part.joint or part.motor]
        if moving:
            problems.append(f"{', '.join(moving)} move, so {compound.name} must be a body, not scenery")
    else:
        problems += _body_problems(compound, roots)
    if not problems:
        boxes = _world_boxes(compound, ordered)
        low = np.min([center - half for center, half in boxes], axis=0)
        high = np.max([center + half for center, half in boxes], axis=0)
        extent = float(np.max(high - low))
        if not SMALLEST_OBJECT <= extent <= LARGEST_OBJECT:
            problems.append(
                f"{compound.name} spans {extent:.2f} m; objects must span {SMALLEST_OBJECT:g} to {LARGEST_OBJECT:g} m"
            )
    return problems


def _body_problems(compound: CompoundObject, roots: list[CompoundPart]) -> list[str]:
    problems: list[str] = []
    if len(roots) != 1:
        problems.append(f"{compound.name}: a body has exactly one root part (parent null), not {len(roots)}")
    elif not roots[0].collides:
        problems.append(f"{roots[0].name}: the root part of a body must collide")
    elif roots[0].joint:
        problems.append(f"{roots[0].name}: the root part moves freely and cannot have a joint")
    total = 0.0
    for part in compound.parts:
        if not part.collides:
            if part.joint or part.motor:
                problems.append(f"{part.name}: a look-only part cannot move; make it collide or drop its joint")
            continue
        mass = part_mass(part)
        total += mass
        density = mass / max(volume(part.shape, part.size), 1e-9)
        if not LIGHTEST <= density <= DENSEST:
            problems.append(
                f"{part.name}: {mass:g} kg in its size is {density:.0f} kg/m³; keep it between {LIGHTEST:g} and "
                f"{DENSEST:g} kg/m³"
            )
    if total > HEAVIEST_BODY:
        problems.append(f"{compound.name} weighs {total:.0f} kg; a body weighs at most {HEAVIEST_BODY:g} kg")
    return problems


def _look(part: CompoundPart) -> dict[str, Raw]:
    look = part.look
    return {
        "color": look.color,
        "style": look.style,
        "finish": look.finish,
        "roughness": look.roughness,
        "metalness": look.metalness,
        "emissive": look.emissive,
        "transparency": look.transparency,
        "surface": look.surface,
    }


def _components(compound: CompoundObject, part: CompoundPart, position: Vector3, rotation: Vector3) -> Part:
    components: dict[str, dict[str, Raw]] = {
        "transform": {"position": position, "rotation": rotation},
        "mesh": {"shape": part.shape, "size": part.size},
        "material": _look(part),
    }
    if part.collides:
        friction = SURFACE_FRICTION[part.look.surface]
        components["collider"] = {"friction": friction}
        if compound.kind == "body":
            components["physics_body"] = {"mode": "dynamic", "mass": part_mass(part)}
        else:
            components["physics_body"] = {"mode": "static"}
    if part.joint:
        joint = part.joint
        components["joint"] = {
            "kind": joint.kind,
            "axis": joint.axis,
            "limits": joint.limits,
            "anchor": joint.anchor,
            "damping": joint.damping,
        }
    if part.motor:
        components["motor"] = {"kind": part.motor.kind, "max_force": part.motor.max_force}
    return Part("", part.name, None, components)


def part_object_id(object_id: str, part_id: str) -> str:
    return f"{object_id}_{part_id}"


def compound_operations(project: Project, compound: CompoundObject, ids: Ids | None = None) -> list[EditOperation]:
    """create_object operations (and add_body for a body) for a compound object that has no problems."""
    ids = ids or Ids(project)
    ordered = _ordered(compound.parts) or compound.parts
    taken_bodies = {body.id for body in project.bodies}
    root_id = compound.id if compound.id not in ids.taken | taken_bodies else ids.fresh(compound.id)
    ids.taken.add(root_id)
    part_ids = {part.id: part_object_id(root_id, part.id) for part in compound.parts}
    part_ids = {key: value if value not in ids.taken else ids.fresh(value) for key, value in part_ids.items()}
    ids.taken |= set(part_ids.values())
    heading = (0.0, 0.0, compound.heading_deg)
    operations: list[EditOperation] = []
    if compound.kind == "scenery":
        group = ObjectSpec(id=root_id, name=compound.name, parent=None, components=[])
        group = placed(group, Placement(compound.position, heading, (1.0, 1.0, 1.0)))
        operations.append(CreateObject(op="create_object", target="world", object=group))
        target = "world"
    else:
        operations.append(AddBody(op="add_body", body=BodySpec(id=root_id, name=compound.name, objects=[])))
        target = root_id
    turn = rotation_matrix(heading)
    for part in ordered:
        position, rotation = part.position, part.rotation
        parent = part_ids[part.parent] if part.parent else (root_id if compound.kind == "scenery" else None)
        if compound.kind == "body" and part.parent is None:
            # The root of a body lives in the world: the object's origin and heading are folded into it.
            moved = np.array(compound.position) + turn @ np.array(part.position)
            position = (float(moved[0]), float(moved[1]), float(moved[2]))
            rotation = wrapped((part.rotation[0], part.rotation[1], part.rotation[2] + compound.heading_deg))
        built = _components(compound, part, position, rotation)
        built.id, built.parent = part_ids[part.id], parent
        operations.append(CreateObject(op="create_object", target=target, object=built.spec()))
    return operations
