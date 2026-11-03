"""What Add object brings into a live Play world: the chosen piece with its size, weight, grip and color, where and
how it arrives, and the copies a rain still has to drop."""

import math
from dataclasses import dataclass
from functools import cache

import numpy as np

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.play import AddObjectCommand, PlayPiece
from icarus.contracts.project import Project
from icarus.contracts.properties import ColorValue, NumberValue, SliderValue, VectorValue
from icarus.contracts.scene import Vector3
from icarus.design.components import view
from icarus.library.components import default_component
from icarus.library.pieces import PIECES
from icarus.sim.play_tools import ToolRejected

GRAVITY = 9.81
MAX_MASS = 10_000.0
# Closer than this to the agent there is no direction to throw in.
MIN_THROW_DISTANCE = 0.1


@dataclass(frozen=True)
class PendingDrop:
    """One copy of a rain, due at a simulated time at a point already scattered around the click."""

    due: float
    position: Vector3


def _is_dynamic(spec: ObjectSpec) -> bool:
    body = view(spec, "physics_body")
    return body is not None and body.text("mode") == "dynamic"


@cache
def play_pieces() -> tuple[PlayPiece, ...]:
    """Every library piece with a shape, and the values the Add object picker starts from."""
    pieces: list[PlayPiece] = []
    for piece in PIECES.values():
        spec = piece.object
        mesh, material, collider = view(spec, "mesh"), view(spec, "material"), view(spec, "collider")
        body = view(spec, "physics_body")
        if mesh is None or mesh.text("shape") == "plane":
            continue
        pieces.append(
            PlayPiece(
                id=piece.id,
                label=piece.label,
                category=piece.category,
                shape=mesh.text("shape"),
                size=mesh.vector("size"),
                mass=body.number("mass") if body is not None and _is_dynamic(spec) else None,
                friction=collider.number("friction") if collider else 0.8,
                bounciness=collider.number("restitution") if collider else 0.0,
                color=material.text("color") if material else "#8a8f98",
            )
        )
    return tuple(pieces)


def shape_volume(shape: str, size: Vector3) -> float:
    """Volume in m³ of a shape with the compiler's reading of its full width, depth and height."""
    x, y, z = size
    radius = x / 2
    match shape:
        case "sphere":
            return 4 / 3 * math.pi * radius**3
        case "cylinder":
            return math.pi * radius**2 * z
        case "capsule":
            return math.pi * radius**2 * max(z - x, 0.0) + 4 / 3 * math.pi * radius**3
        case "wedge":
            return x * y * z / 2
        case "corner_wedge":
            return x * y * z / 3
        case _:
            return x * y * z


def _unique_name(project: Project, spec: ObjectSpec) -> tuple[str, str]:
    taken = {obj.id for obj in project.world.objects} | {obj.id for body in project.bodies for obj in body.objects}
    number, object_id, name = 1, spec.id, spec.name
    while object_id in taken:
        number += 1
        object_id, name = f"{spec.id}_{number}", f"{spec.name} {number}"
    return object_id, name


def _component(spec: ObjectSpec, kind: str):
    found = next((item for item in spec.components if item.kind == kind), None)
    if found is None:
        found = default_component(kind, kind)
        spec.components.append(found)
    return found


def check_drop(command: AddObjectCommand) -> None:
    """Refuse what cannot happen to this piece before anything is added, so a rain never stops half way."""
    piece = PIECES.get(command.piece)
    if piece is None:
        raise ToolRejected(f"There is no library piece {command.piece!r}")
    if _is_dynamic(piece.object):
        return
    if command.placement != "place":
        raise ToolRejected(f"{piece.label} is fixed in place, so it can be placed but not dropped or thrown")
    if command.mass is not None or command.density is not None:
        raise ToolRejected(f"{piece.label} is fixed in place, so it has no mass to set")


def piece_object(project: Project, command: AddObjectCommand, position: Vector3) -> ObjectSpec:
    """The chosen piece as a world object standing on `position`, or held `height` above it to fall or fly."""
    check_drop(command)
    piece = PIECES[command.piece]
    spec = piece.object.model_copy(deep=True)
    spec.id, spec.name = _unique_name(project, spec)
    scale = command.scale
    mesh = _component(spec, "mesh")
    shape = view(spec, "mesh")
    size = shape.vector("size") if shape else (1.0, 1.0, 1.0)
    scaled = (size[0] * scale, size[1] * scale, size[2] * scale)
    mesh.properties["size"] = VectorValue(type="vector", value=scaled)
    if _is_dynamic(spec):
        mass = command.mass
        if command.density is not None:
            mass = command.density * shape_volume(shape.text("shape") if shape else "box", scaled)
        if mass is not None:
            if mass > MAX_MASS:
                raise ToolRejected(f"That {piece.label.lower()} would weigh {mass:,.0f} kg; the most is 10,000 kg")
            _component(spec, "physics_body").properties["mass"] = NumberValue(type="number", value=max(mass, 0.001))
    collider = _component(spec, "collider")
    if command.friction is not None:
        collider.properties["friction"] = SliderValue(type="slider", value=command.friction)
    if command.bounciness is not None:
        collider.properties["restitution"] = SliderValue(type="slider", value=command.bounciness)
    if command.color is not None:
        _component(spec, "material").properties["color"] = ColorValue(type="color", value=command.color)
    transform = _component(spec, "transform")
    resting = transform.properties.get("position")
    # The piece's own height keeps it standing on the clicked surface.
    lift = (resting.value[2] if isinstance(resting, VectorValue) else 0.0) * scale
    above = 0.0 if command.placement == "place" else command.height
    placed = (position[0], position[1], position[2] + lift + above)
    transform.properties["position"] = VectorValue(type="vector", value=placed)
    return spec


def spawn_point(spec: ObjectSpec) -> Vector3:
    transform = view(spec, "transform")
    return transform.vector("position") if transform else (0.0, 0.0, 0.0)


def throw_velocity(start: np.ndarray, target: np.ndarray, speed: float) -> np.ndarray:
    """The launch velocity of `speed` m/s whose flatter arc under gravity passes through `target`."""
    offset = target - start
    distance = float(np.hypot(offset[0], offset[1]))
    if distance < MIN_THROW_DISTANCE:
        raise ToolRejected("Click away from the agent to throw at it")
    rise = float(offset[2])
    square = speed**2
    reach = square**2 - GRAVITY * (GRAVITY * distance**2 + 2 * rise * square)
    if reach < 0:
        raise ToolRejected(f"At {speed:g} m/s it cannot reach the agent {distance:.1f} m away; throw faster or closer")
    angle = math.atan((square - math.sqrt(reach)) / (GRAVITY * distance))
    heading = offset[:2] / distance
    horizontal = speed * math.cos(angle)
    return np.array([heading[0] * horizontal, heading[1] * horizontal, speed * math.sin(angle)])


def rain(command: AddObjectCommand, now: float, rng: np.random.Generator) -> list[PendingDrop]:
    """Where and when each copy falls: the first at once, then one every interval, scattered within the spread."""
    drops: list[PendingDrop] = []
    x, y, z = command.position
    for index in range(command.count):
        radius = command.spread * math.sqrt(float(rng.uniform())) if index > 0 else 0.0
        turn = float(rng.uniform(0, 2 * math.pi)) if index > 0 else 0.0
        point = (x + radius * math.cos(turn), y + radius * math.sin(turn), z)
        drops.append(PendingDrop(due=now + index * command.interval, position=point))
    return drops
