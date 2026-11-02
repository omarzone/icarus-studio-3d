from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.operations import (
    AddBody,
    CreateObject,
    EditOperation,
    SetBrain,
    SetProperty,
    SetRewardTerm,
    SetTaskFamily,
)
from icarus.contracts.properties import ColorValue, ListValue, SliderValue, VectorValue
from icarus.contracts.specs import BodySpec, RewardTermSpec
from icarus.design.surfaces import SURFACE_FRICTION
from icarus.library.templates import Part, Raw, solid

Shape = Literal["box", "sphere", "capsule", "cylinder"]
Surface = Literal["asphalt", "concrete", "grass", "snow", "ice", "rubber", "wood", "metal"]
PropRole = Literal["wall", "ramp", "platform", "shelf", "obstacle", "bump", "marking", "decoration", "movable"]
Vector3 = tuple[float, float, float]
Color = str
_ID = r"^[a-z][a-z0-9_]{0,40}$"
_COLOR = r"^#[0-9a-fA-F]{6}$"
# Where the empty world keeps its ground, sun and spawn point.
GROUND, SUN, SPAWN = "ground", "sun", "spawn"
AREA_HEIGHT = 1.0


class _Plan(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PlanJoint(_Plan):
    kind: Literal["hinge", "slide"]
    # In the part's own frame, after its rotation.
    axis: Vector3
    # Degrees for a hinge (-180..180 spins freely, like a wheel), metres for a slide.
    limits: tuple[float, float]
    anchor: Vector3
    damping: float = Field(ge=0, le=100)


class PlanMotor(_Plan):
    kind: Literal["position", "torque"]
    max_force: float = Field(gt=0, le=10_000)


class PlanRays(_Plan):
    range: float = Field(ge=0.05, le=50)
    count: int = Field(ge=1, le=32)
    # Degrees; below zero the rays look down at low obstacles.
    tilt: float = Field(ge=-60, le=30)


class PlanPart(_Plan):
    id: str = Field(pattern=_ID)
    name: str = Field(min_length=1, max_length=80)
    # Null only for the body's root part.
    parent: str | None
    shape: Shape
    size: Vector3
    # From the parent part's center; the root part's position is in the world.
    position: Vector3
    rotation: Vector3
    mass: float = Field(gt=0, le=10_000)
    color: Color = Field(pattern=_COLOR)
    friction: float = Field(ge=0, le=2)
    joint: PlanJoint | None
    motor: PlanMotor | None
    rays: PlanRays | None
    balance: bool
    touch: bool


class PlanBody(_Plan):
    id: str = Field(pattern=_ID)
    name: str = Field(min_length=1, max_length=80)
    parts: list[PlanPart] = Field(min_length=1, max_length=24)


class PlanProp(_Plan):
    id: str = Field(pattern=_ID)
    name: str = Field(min_length=1, max_length=80)
    # What the prop is for in the layout, so the look follows the request.
    role: PropRole
    shape: Shape
    size: Vector3
    position: Vector3
    rotation: Vector3
    # A movable prop is pushed around by the body; every other prop is fixed in place.
    movable: bool
    mass: float = Field(gt=0, le=10_000)
    color: Color = Field(pattern=_COLOR)
    surface: Surface


class PlanArea(_Plan):
    id: str = Field(pattern=_ID)
    name: str = Field(min_length=1, max_length=80)
    position: tuple[float, float]
    size: tuple[float, float]


class PlanLamp(_Plan):
    id: str = Field(pattern=_ID)
    name: str = Field(min_length=1, max_length=80)
    position: Vector3
    intensity: float = Field(ge=0, le=5)
    color: Color = Field(pattern=_COLOR)


class PlanGoal(_Plan):
    name: str = Field(min_length=1, max_length=80)
    position: tuple[float, float]
    radius: float = Field(ge=0.1, le=20)


class PlanWorld(_Plan):
    # The visual concept in one sentence, and the colors every object takes from.
    look: str = Field(min_length=1, max_length=300)
    palette: list[Color] = Field(min_length=2, max_length=8)
    ground_surface: Surface
    ground_color: Color = Field(pattern=_COLOR)
    ground_friction: float = Field(ge=0, le=2)
    sun_intensity: float = Field(ge=0, le=5)
    sun_color: Color = Field(pattern=_COLOR)
    props: list[PlanProp] = Field(max_length=40)
    areas: list[PlanArea] = Field(max_length=6)
    lamps: list[PlanLamp] = Field(max_length=4)
    goal: PlanGoal | None


class PlanReward(_Plan):
    term: str
    weight: float


class PlanTask(_Plan):
    family: Literal["navigation", "locomotion"]
    rewards: list[PlanReward] = Field(min_length=1, max_length=8)
    copies: int = Field(ge=1, le=64)


class ScratchPlan(_Plan):
    """A design from the empty world: environment, bodies and task, in the units the library uses."""

    world: PlanWorld
    bodies: list[PlanBody] = Field(min_length=1, max_length=2)
    task: PlanTask


def _vector(value: Vector3) -> VectorValue:
    return VectorValue(type="vector", value=value)


def _set(obj: str, component: str, prop: str, value) -> SetProperty:
    return SetProperty(op="set_property", object=obj, component=component, property=prop, value=value)


def _create(target: str, part: Part) -> CreateObject:
    return CreateObject(op="create_object", target=target, object=part.spec())


def _prop(prop: PlanProp) -> Part:
    part = solid(prop.id, prop.name, None, prop.position, prop.shape, prop.size, prop.mass, prop.color)
    part.components["transform"]["rotation"] = prop.rotation
    part.components["material"]["surface"] = prop.surface
    part.components["collider"] = {"friction": SURFACE_FRICTION[prop.surface]}
    if not prop.movable:
        part.components["physics_body"] = {"mode": "static"}
    return part


def world_operations(world: PlanWorld, start: tuple[float, float]) -> list[EditOperation]:
    """The environment on top of the empty world, with the spawn point under the agent's start."""
    operations: list[EditOperation] = [
        _set(GROUND, "surface", "kind", ListValue(type="list", value=world.ground_surface)),
        _set(GROUND, "surface", "friction", SliderValue(type="slider", value=world.ground_friction)),
        _set(GROUND, "material", "surface", ListValue(type="list", value=world.ground_surface)),
        _set(GROUND, "material", "color", ColorValue(type="color", value=world.ground_color)),
        _set(SUN, "light", "intensity", SliderValue(type="slider", value=world.sun_intensity)),
        _set(SUN, "light", "color", ColorValue(type="color", value=world.sun_color)),
        _set(SPAWN, "transform", "position", _vector((start[0], start[1], 0.0))),
    ]
    operations += [_create("world", _prop(prop)) for prop in world.props]
    for area in world.areas:
        zone: dict[str, Raw] = {"size": (area.size[0], area.size[1], AREA_HEIGHT)}
        components = {"transform": {"position": (area.position[0], area.position[1], 0.0)}, "zone": zone}
        operations.append(_create("world", Part(area.id, area.name, None, components)))
    for lamp in world.lamps:
        light: dict[str, Raw] = {"kind": "point", "intensity": lamp.intensity, "color": lamp.color}
        operations.append(
            _create("world", Part(lamp.id, lamp.name, None, {"transform": {"position": lamp.position}, "light": light}))
        )
    if world.goal:
        goal = world.goal
        components = {"transform": {"position": (goal.position[0], goal.position[1], 0.0)}, "goal_zone": {}}
        components["goal_zone"] = {"radius": goal.radius}
        operations.append(_create("world", Part("goal", goal.name, None, components)))
    return operations


def _ordered(parts: list[PlanPart]) -> list[PlanPart]:
    """Parents before their children, so every part is created inside one that exists."""
    placed: list[PlanPart] = []
    ids: set[str] = set()
    remaining = list(parts)
    while remaining:
        ready = [part for part in remaining if part.parent is None or part.parent in ids]
        if not ready:
            # A missing parent or a loop: keep the rest in order and let validation name it.
            return placed + remaining
        placed += ready
        ids |= {part.id for part in ready}
        remaining = [part for part in remaining if part not in ready]
    return placed


def _part(part: PlanPart) -> Part:
    extra: dict[str, dict[str, Raw]] = {"collider": {"friction": part.friction}}
    if part.joint:
        joint = part.joint
        extra["joint"] = {
            "kind": joint.kind,
            "axis": joint.axis,
            "limits": joint.limits,
            "anchor": joint.anchor,
            "damping": joint.damping,
        }
    if part.motor:
        extra["motor"] = {"kind": part.motor.kind, "max_force": part.motor.max_force}
    if part.rays:
        extra["distance_ray"] = {"range": part.rays.range, "count": part.rays.count, "tilt": part.rays.tilt}
    if part.balance:
        extra["balance"] = {}
    if part.touch:
        extra["touch"] = {}
    return solid(
        part.id,
        part.name,
        part.parent,
        part.position,
        part.shape,
        part.size,
        part.mass,
        part.color,
        rotation=part.rotation,
        extra=extra,
    )


def body_operations(body: PlanBody) -> list[EditOperation]:
    operations: list[EditOperation] = [AddBody(op="add_body", body=BodySpec(id=body.id, name=body.name, objects=[]))]
    return operations + [_create(body.id, _part(part)) for part in _ordered(body.parts)]


def task_operations(task: PlanTask) -> list[EditOperation]:
    operations: list[EditOperation] = [SetTaskFamily(op="set_task_family", family=task.family)]
    operations += [
        SetRewardTerm(op="set_reward_term", term=RewardTermSpec(term=reward.term, weight=reward.weight))
        for reward in task.rewards
    ]
    return [*operations, SetBrain(op="set_brain", copies=task.copies)]


def agent_start(plan: ScratchPlan) -> tuple[float, float]:
    """Where the first body's root part starts on the ground plane."""
    root = next((part for part in plan.bodies[0].parts if part.parent is None), plan.bodies[0].parts[0])
    return root.position[0], root.position[1]
