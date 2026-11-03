"""Transforms of objects in their parent's frame, as the compiler reads them: position, rotation around X then Y
then Z (degrees) and a scale that sizes the object's own shape only."""

import math
from dataclasses import dataclass

import mujoco
import numpy as np

from icarus.contracts.objects import ComponentSpec, ObjectSpec
from icarus.contracts.properties import VectorValue
from icarus.design.components import view

type Vector = tuple[float, float, float]
ROTATION_LIMIT = 360.0
SCALE_LIMITS = (0.01, 100.0)
POSITION_LIMIT = 1000.0


@dataclass(frozen=True)
class Placement:
    position: Vector
    rotation: Vector
    scale: Vector


def rotation_matrix(rotation_deg: Vector) -> np.ndarray:
    """The rotation the compiler gives an object, from the same MuJoCo conversion."""
    quat = np.zeros(4)
    mujoco.mju_euler2Quat(quat, np.radians(rotation_deg), "XYZ")
    matrix = np.zeros(9)
    mujoco.mju_quat2Mat(matrix, quat)
    return matrix.reshape(3, 3)


def rotation_degrees(matrix: np.ndarray) -> Vector:
    """Angles around X, then Y, then Z (fixed axes) that make this rotation; the inverse of rotation_matrix."""
    sine = float(np.clip(-matrix[2, 0], -1.0, 1.0))
    pitch = math.asin(sine)
    if abs(sine) > 0.999999:
        roll, yaw = 0.0, math.atan2(-matrix[0, 1], matrix[1, 1])
    else:
        roll, yaw = math.atan2(matrix[2, 1], matrix[2, 2]), math.atan2(matrix[1, 0], matrix[0, 0])
    return rounded((math.degrees(roll), math.degrees(pitch), math.degrees(yaw)))


def rounded(values, digits: int = 4) -> Vector:
    first, second, third = (round(float(value), digits) + 0.0 for value in values)
    return (first, second, third)


def placement(obj: ObjectSpec) -> Placement:
    transform = view(obj, "transform")
    if transform is None:
        return Placement((0.0, 0.0, 0.0), (0.0, 0.0, 0.0), (1.0, 1.0, 1.0))
    return Placement(transform.vector("position"), transform.vector("rotation"), transform.vector("scale"))


def placement_problem(name: str, moved: Placement) -> str | None:
    """Why a computed transform falls outside the transform's ranges, or None."""
    if any(abs(value) > POSITION_LIMIT for value in moved.position):
        return f"{name} would land at {list(moved.position)}, outside ±{POSITION_LIMIT:g} m"
    low, high = SCALE_LIMITS
    if any(not low <= value <= high for value in moved.scale):
        return f"{name} would get scale {list(moved.scale)}, outside {low:g} to {high:g}"
    return None


def _transform_id(obj: ObjectSpec) -> str:
    existing = next((item.id for item in obj.components if item.kind == "transform"), None)
    if existing:
        return existing
    taken = {item.id for item in obj.components}
    return next(name for name in ("transform", *(f"transform_{n}" for n in range(2, 99))) if name not in taken)


def transform_component(obj: ObjectSpec, moved: Placement) -> ComponentSpec:
    return ComponentSpec(
        id=_transform_id(obj),
        kind="transform",
        properties={
            "position": VectorValue(type="vector", value=rounded(moved.position)),
            "rotation": VectorValue(type="vector", value=wrapped(moved.rotation)),
            "scale": VectorValue(type="vector", value=rounded(moved.scale)),
        },
    )


def wrapped(rotation: Vector) -> Vector:
    """Angles folded into -180..180, inside the transform's range."""
    return rounded(((value + 180.0) % 360.0) - 180.0 for value in rotation)


def placed(obj: ObjectSpec, moved: Placement) -> ObjectSpec:
    """A copy of the object whose transform is this placement; a transform is added when it had none."""
    component = transform_component(obj, moved)
    others = [item for item in obj.components if item.id != component.id]
    return obj.model_copy(update={"components": [component, *others]}, deep=True)


def subtree(objects: list[ObjectSpec], root: str) -> list[ObjectSpec]:
    """The root and everything inside it, every parent before its children."""
    ordered = [obj for obj in objects if obj.id == root]
    known = {root}
    grew = True
    while grew:
        grew = False
        for obj in objects:
            if obj.parent in known and obj.id not in known:
                ordered.append(obj)
                known.add(obj.id)
                grew = True
    return ordered
