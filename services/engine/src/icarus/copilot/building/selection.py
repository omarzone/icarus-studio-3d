"""Which objects of a project match a filter, with where they stand in the compiled scene (world frame)."""

from dataclasses import dataclass
from typing import Literal, Self

import mujoco
import numpy as np
from pydantic import BaseModel, ConfigDict, Field, model_validator

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.project import Project
from icarus.contracts.properties import Vector3
from icarus.copilot.building.frames import placement, rounded, subtree
from icarus.design.compiler import CompiledModel
from icarus.design.components import view
from icarus.design.scene import scene_description
from icarus.projects.document import containers

GROUP = "group"
type RowField = Literal[
    "id", "name", "parent", "container", "kinds", "position", "size", "bounds", "local_position", "rotation",
    "color", "style", "children",
]  # fmt: skip
DEFAULT_FIELDS: list[RowField] = ["id", "name", "parent", "kinds", "position", "size"]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Region(_Strict):
    min: Vector3 = Field(description="Lowest corner in metres, world frame.")
    max: Vector3 = Field(description="Highest corner in metres, world frame.")

    @model_validator(mode="after")
    def _ordered(self) -> Self:
        if any(low > high for low, high in zip(self.min, self.max, strict=True)):
            raise ValueError("every value of min must be at most the same value of max")
        return self


class Near(_Strict):
    point: Vector3 = Field(description="A point in metres, world frame.")
    radius_m: float = Field(gt=0, le=1000)


class ObjectFilter(_Strict):
    text: str | None = Field(default=None, max_length=80, description="Part of the id or name, any case.")
    kinds: list[str] = Field(
        default=[], max_length=8, description='Component kinds it must all have; "group" is a transform-only parent.'
    )
    container: str | None = Field(default=None, description='"world" or a body id; none searches both.')
    inside: str | None = Field(default=None, description="An object id: only objects inside it, at any depth.")
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$", description="material.color close to this.")
    color_tolerance: float = Field(default=0.05, ge=0, le=1, description="0 is exact, 1 matches every color.")
    style: str | None = Field(default=None, max_length=40, description="material.style, such as plain.")
    surface: str | None = Field(default=None, max_length=40, description="material.surface, such as wood.")
    region: Region | None = Field(default=None, description="Its center lies inside this box.")
    near: Near | None = Field(default=None, description="Its center lies within radius_m of point.")

    @property
    def needs_scene(self) -> bool:
        return self.region is not None or self.near is not None


@dataclass(frozen=True)
class Box:
    low: tuple[float, float, float]
    high: tuple[float, float, float]

    @property
    def center(self) -> tuple[float, float, float]:
        return rounded(((a + b) / 2 for a, b in zip(self.low, self.high, strict=True)), 3)

    @property
    def size(self) -> tuple[float, float, float]:
        return rounded((b - a for a, b in zip(self.low, self.high, strict=True)), 3)


def merged(boxes: list[Box]) -> Box | None:
    if not boxes:
        return None
    low = tuple(min(box.low[axis] for box in boxes) for axis in range(3))
    high = tuple(max(box.high[axis] for box in boxes) for axis in range(3))
    return Box(rounded(low, 3), rounded(high, 3))


@dataclass(frozen=True)
class Located:
    obj: ObjectSpec
    container: str
    # The box of its own shapes, or of what is inside it when it has none; None when nothing compiled.
    box: Box | None
    origin: tuple[float, float, float] | None
    children: int


def world_boxes(compiled: CompiledModel) -> tuple[dict[str, list[Box]], dict[str, tuple[float, float, float]]]:
    """Each object's geom boxes (axis-aligned, rotation included) and its frame origin, in the world frame."""
    scene = scene_description(compiled, 0)
    owners = {mjcf: object_id for object_id, mjcf in compiled.objects.items()}
    boxes: dict[str, list[Box]] = {}
    for geom in scene.geoms:
        owner = owners.get(geom.body)
        if owner is None:
            continue
        matrix = np.zeros(9)
        mujoco.mju_quat2Mat(matrix, np.asarray(geom.quaternion, dtype=float))
        half = np.abs(matrix.reshape(3, 3)) @ (np.asarray(geom.size) / 2)
        center = np.asarray(geom.position)
        boxes.setdefault(owner, []).append(Box(rounded(center - half, 3), rounded(center + half, 3)))
    origins = {owners[body.name]: rounded(body.position, 3) for body in scene.bodies if body.name in owners}
    return boxes, origins


def is_group(obj: ObjectSpec, objects: list[ObjectSpec]) -> bool:
    return all(item.kind == "transform" for item in obj.components) and any(o.parent == obj.id for o in objects)


def locate(project: Project, compiled: CompiledModel | None) -> list[Located]:
    boxes, origins = world_boxes(compiled) if compiled is not None else ({}, {})
    found: list[Located] = []
    for index, objects in enumerate(containers(project)):
        container = "world" if index == 0 else project.bodies[index - 1].id
        for obj in objects:
            own = merged(boxes.get(obj.id, []))
            if own is None and compiled is not None:
                inner = [box for item in subtree(objects, obj.id)[1:] for box in boxes.get(item.id, [])]
                own = merged(inner)
            children = sum(1 for item in objects if item.parent == obj.id)
            found.append(Located(obj, container, own, origins.get(obj.id), children))
    return found


def _kinds(item: Located, objects: list[ObjectSpec]) -> list[str]:
    kinds = sorted({component.kind for component in item.obj.components})
    return [*kinds, GROUP] if is_group(item.obj, objects) else kinds


def _rgb(color: str) -> np.ndarray:
    return np.array([int(color[index : index + 2], 16) / 255 for index in (1, 3, 5)])


def center(item: Located) -> tuple[float, float, float] | None:
    return item.box.center if item.box is not None else item.origin


def _matches(item: Located, wanted: ObjectFilter, objects: list[ObjectSpec], inside: set[str]) -> bool:
    obj = item.obj
    if wanted.text and wanted.text.lower() not in f"{obj.id}\n{obj.name}".lower():
        return False
    if wanted.container and item.container != wanted.container:
        return False
    if wanted.inside is not None and obj.id not in inside:
        return False
    if wanted.kinds and not set(wanted.kinds) <= set(_kinds(item, objects)):
        return False
    material = view(obj, "material")
    if (wanted.color or wanted.style or wanted.surface) and material is None:
        return False
    if material is not None:
        if wanted.color and np.linalg.norm(_rgb(material.text("color")) - _rgb(wanted.color)) / 3**0.5 > (
            wanted.color_tolerance
        ):
            return False
        if wanted.style and material.text("style") != wanted.style:
            return False
        if wanted.surface and material.text("surface") != wanted.surface:
            return False
    point = center(item)
    if wanted.region is not None and (
        point is None
        or any(not lo <= p <= hi for p, lo, hi in zip(point, wanted.region.min, wanted.region.max, strict=True))
    ):
        return False
    near = wanted.near
    return near is None or (
        point is not None and float(np.linalg.norm(np.subtract(point, near.point))) <= near.radius_m
    )


def matching(project: Project, compiled: CompiledModel | None, wanted: ObjectFilter) -> list[Located]:
    """Every object matching the filter, in document order."""
    located = locate(project, compiled)
    by_container: dict[str, list[ObjectSpec]] = {}
    for item in located:
        by_container.setdefault(item.container, []).append(item.obj)
    inside: set[str] = set()
    if wanted.inside is not None:
        for objects in by_container.values():
            if any(obj.id == wanted.inside for obj in objects):
                inside = {obj.id for obj in subtree(objects, wanted.inside)[1:]}
    return [item for item in located if _matches(item, wanted, by_container[item.container], inside)]


def row(item: Located, fields: list[RowField], objects: list[ObjectSpec]) -> dict[str, object]:
    obj, where = item.obj, placement(item.obj)
    material = view(obj, "material")
    values: dict[str, object] = {
        "id": obj.id,
        "name": obj.name,
        "parent": obj.parent,
        "container": item.container,
        "kinds": _kinds(item, objects),
        "position": list(point) if (point := center(item)) else None,
        "size": list(item.box.size) if item.box else None,
        "bounds": {"min": list(item.box.low), "max": list(item.box.high)} if item.box else None,
        "local_position": list(where.position),
        "rotation": list(where.rotation),
        "color": material.text("color") if material else None,
        "style": material.text("style") if material else None,
        "children": item.children,
    }
    return {name: values[name] for name in fields}
