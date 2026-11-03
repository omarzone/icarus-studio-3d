"""Which joints of a body with a vehicle component are its wheels and steering, and the actuators it drives them with.

Wheels are hinges with no limits whose axis lies sideways; steering joints are limited hinges whose axis stands
upright. Positions are in the frame of the body's root part, where +x is forward and +y is left."""

import math
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Literal

import mujoco
import numpy as np

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.project import Project
from icarus.design.compile_error import CompileError
from icarus.design.components import ComponentView, view

Steering = Literal["ackermann", "differential"]
# An axis counts as sideways or upright when this much of it points that way.
AXIS_SHARE = 0.7
# Wheels this close to the middle of the wheelbase are neither front nor rear, in metres.
AXLE_TOLERANCE = 0.05
DRIVE_SUFFIX = ":drive"
BRAKE_SUFFIX = ":brake"
STEER_SUFFIX = ":steer"


@dataclass(frozen=True)
class Wheel:
    object: str
    x: float
    y: float
    # +1 when a positive spin rolls the vehicle forward, -1 when the wheel's axis points right.
    roll: float
    drive: bool
    steered: bool


@dataclass(frozen=True)
class SteerJoint:
    object: str
    x: float
    y: float
    # +1 when a positive angle turns left.
    turn: float
    low: float
    high: float


@dataclass(frozen=True)
class VehicleLayout:
    root: str
    steering: Steering
    reverse: bool
    max_torque: float
    # Radians, already within every steering joint's limits.
    max_steer: float
    max_speed: float
    brake: float
    steer_force: float
    wheels: tuple[Wheel, ...]
    steers: tuple[SteerJoint, ...]
    # Forward position of the axle that does not steer, which the turn center lies on.
    rear_axle: float

    @property
    def owned(self) -> frozenset[str]:
        """Objects whose joints the vehicle drives, so their own motors give way to it."""
        return frozenset([wheel.object for wheel in self.wheels] + [steer.object for steer in self.steers])


def _rotation(degrees: tuple[float, float, float]) -> np.ndarray:
    quat, matrix = np.zeros(4), np.zeros(9)
    mujoco.mju_euler2Quat(quat, np.radians(degrees), "XYZ")
    mujoco.mju_quat2Mat(matrix, quat)
    return matrix.reshape(3, 3)


def _frames(objects: list[ObjectSpec], root: str) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    """Each part under the root as (position, rotation) in the root's frame."""
    by_id = {obj.id: obj for obj in objects}
    frames: dict[str, tuple[np.ndarray, np.ndarray]] = {root: (np.zeros(3), np.eye(3))}

    def frame(object_id: str, depth: int = 0) -> tuple[np.ndarray, np.ndarray] | None:
        if object_id in frames:
            return frames[object_id]
        obj = by_id.get(object_id)
        if obj is None or obj.parent is None or depth > len(objects):
            return None
        parent = frame(obj.parent, depth + 1)
        if parent is None:
            return None
        transform = view(obj, "transform")
        position = np.array(transform.vector("position") if transform else (0, 0, 0), dtype=float)
        rotation = _rotation(transform.vector("rotation") if transform else (0, 0, 0))
        frames[object_id] = (parent[0] + parent[1] @ position, parent[1] @ rotation)
        return frames[object_id]

    for obj in objects:
        frame(obj.id)
    return frames


def _drives(drive: str, x: float, middle: float) -> bool:
    match drive:
        case "front":
            return x >= middle - AXLE_TOLERANCE
        case "rear":
            return x <= middle + AXLE_TOLERANCE
        case _:
            return True


def _joints(objects: list[ObjectSpec], frames: dict[str, tuple[np.ndarray, np.ndarray]]):
    wheels: list[tuple[ObjectSpec, np.ndarray, np.ndarray]] = []
    steers: list[tuple[ObjectSpec, np.ndarray, np.ndarray, ComponentView]] = []
    for obj in objects:
        joint = view(obj, "joint")
        if joint is None or joint.text("kind") != "hinge" or obj.id not in frames:
            continue
        position, rotation = frames[obj.id]
        anchor = position + rotation @ np.array(joint.vector("anchor"), dtype=float)
        axis = rotation @ np.array(joint.vector("axis"), dtype=float)
        axis = axis / max(float(np.linalg.norm(axis)), 1e-9)
        low, high = joint.span("limits")
        if low <= -180 and high >= 180 and abs(axis[1]) >= AXIS_SHARE:
            wheels.append((obj, anchor, axis))
        elif (low > -180 or high < 180) and abs(axis[2]) >= AXIS_SHARE:
            steers.append((obj, anchor, axis, joint))
    return wheels, steers


def _under(objects: dict[str, ObjectSpec], object_id: str, ancestors: set[str]) -> bool:
    current = objects[object_id].parent
    while current is not None and current in objects:
        if current in ancestors:
            return True
        current = objects[current].parent
    return False


def vehicle_layout(objects: list[ObjectSpec]) -> VehicleLayout | None:
    """The vehicle of one body's object list, or None when its root carries no vehicle component."""
    root = next((obj for obj in objects if obj.parent is None), None)
    holder = next((obj for obj in objects if view(obj, "vehicle")), None)
    if holder is None or root is None:
        return None
    if holder.id != root.id:
        raise CompileError(f"The vehicle on {holder.name} belongs on the body's root part, {root.name}")
    vehicle = view(root, "vehicle")
    assert vehicle is not None
    frames = _frames(objects, root.id)
    found_wheels, found_steers = _joints(objects, frames)
    if not found_wheels:
        raise CompileError(f"{root.name} is a vehicle without wheels: hinges with no limits turning sideways")
    by_id = {obj.id: obj for obj in objects}
    steering: Steering = "differential" if vehicle.text("steering") == "differential" else "ackermann"
    steer_ids = {obj.id for obj, *_ in found_steers} if steering == "ackermann" else set()
    xs = [float(anchor[0]) for _, anchor, _ in found_wheels]
    middle = (max(xs) + min(xs)) / 2
    drive = vehicle.text("drive")
    wheels = tuple(
        Wheel(
            object=obj.id,
            x=float(anchor[0]),
            y=float(anchor[1]),
            roll=1.0 if axis[1] > 0 else -1.0,
            drive=_drives(drive, float(anchor[0]), middle),
            steered=_under(by_id, obj.id, steer_ids),
        )
        for obj, anchor, axis in found_wheels
    )
    max_steer = math.radians(vehicle.number("max_steer"))
    steers: list[SteerJoint] = []
    for obj, anchor, axis, joint in found_steers if steering == "ackermann" else []:
        low, high = (math.radians(value) for value in joint.span("limits"))
        max_steer = min(max_steer, abs(low), abs(high))
        steers.append(SteerJoint(obj.id, float(anchor[0]), float(anchor[1]), 1.0 if axis[2] > 0 else -1.0, low, high))
    fixed = [wheel.x for wheel in wheels if not wheel.steered]
    rear_axle = sum(fixed) / len(fixed) if fixed else min(xs)
    return VehicleLayout(
        root=root.id,
        steering=steering,
        reverse=vehicle.switch("reverse"),
        max_torque=vehicle.number("max_torque"),
        max_steer=max_steer,
        max_speed=vehicle.number("max_speed"),
        brake=vehicle.number("brake"),
        steer_force=vehicle.number("steer_force"),
        wheels=wheels,
        steers=tuple(steers),
        rear_axle=rear_axle,
    )


def vehicle_layouts(project: Project) -> dict[str, VehicleLayout]:
    """Body root id → its vehicle, for every body that is one."""
    layouts = (vehicle_layout(body.objects) for body in project.bodies)
    return {layout.root: layout for layout in layouts if layout is not None}


def ackermann_angles(layout: VehicleLayout, steering: float) -> list[float]:
    """Each steering joint's angle in radians for a -1..1 command, above zero turning left: the inner wheel turns
    to the full angle and every other one points at the same turn center on the line of the fixed axle."""
    command = max(-1.0, min(1.0, steering))
    if abs(command) < 1e-6 or not layout.steers:
        return [0.0 for _ in layout.steers]
    side = 1.0 if command > 0 else -1.0
    inner = abs(command) * layout.max_steer
    reaches = [steer.x - layout.rear_axle for steer in layout.steers]
    inner_reach = max((abs(reach) for reach in reaches), default=0.0)
    if inner_reach < 1e-6:
        return [side * inner * steer.turn for steer in layout.steers]
    offset = max(side * steer.y for steer in layout.steers)
    radius = inner_reach / math.tan(inner) + offset
    angles = []
    for steer, reach in zip(layout.steers, reaches, strict=True):
        angle = side * math.atan2(reach, radius - side * steer.y)
        angles.append(min(max(angle * steer.turn, steer.low), steer.high))
    return angles


def _fmt(values) -> str:
    return " ".join(f"{float(value):.6g}" for value in values)


def add_vehicle_actuators(actuators: ET.Element, layout: VehicleLayout) -> None:
    """A torque motor on each drive wheel, a damper on every wheel for the brake and a position servo on each
    steering joint; the brain reaches them through throttle, brake and steering (sim/vehicle.py)."""
    for wheel in layout.wheels:
        joint = f"{wheel.object}:joint"
        if wheel.drive:
            gear = _fmt([layout.max_torque * wheel.roll])
            ET.SubElement(
                actuators,
                "motor",
                {"name": f"{wheel.object}{DRIVE_SUFFIX}", "joint": joint, "ctrlrange": "-1 1", "gear": gear},
            )
        if layout.brake <= 0:
            continue
        ET.SubElement(
            actuators,
            "damper",
            {"name": f"{wheel.object}{BRAKE_SUFFIX}", "joint": joint, "kv": _fmt([layout.brake]), "ctrlrange": "0 1"},
        )
    for steer in layout.steers:
        force = layout.steer_force
        attributes = {
            "name": f"{steer.object}{STEER_SUFFIX}",
            "joint": f"{steer.object}:joint",
            "ctrlrange": _fmt([steer.low, steer.high]),
            "kp": _fmt([force]),
            "dampratio": "1",
            "forcerange": _fmt([-force, force]),
        }
        ET.SubElement(actuators, "position", attributes)
