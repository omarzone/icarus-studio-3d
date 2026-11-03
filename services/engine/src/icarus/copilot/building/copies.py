"""Copies of an object and everything inside it as plain create_object operations, with fresh ids."""

import colorsys
import re
from collections.abc import Callable, Iterable
from dataclasses import dataclass

import numpy as np

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.operations import CreateObject, EditOperation
from icarus.contracts.project import Project
from icarus.contracts.properties import AssetValue, ChoiceValue, ColorValue, ListValue, TextValue, VectorValue
from icarus.copilot.building.frames import Placement, placed, placement, rounded, subtree
from icarus.design.components import view
from icarus.projects.document import all_objects, containers

ID_LENGTH = 64
NAME_LENGTH = 80
type Member = Callable[[ObjectSpec], ObjectSpec]


class BuildError(ValueError):
    """Arguments that cannot be expanded into operations, said so the model can fix them."""


def container_of(project: Project, object_id: str) -> tuple[str, list[ObjectSpec]]:
    """The create_object target holding an object ("world" or a body id) and its object list."""
    for index, objects in enumerate(containers(project)):
        if any(obj.id == object_id for obj in objects):
            return ("world" if index == 0 else project.bodies[index - 1].id), objects
    raise BuildError(f"There is no object `{object_id}`")


def is_free(obj: ObjectSpec) -> bool:
    """A dynamic object at the top of its container, which moves on its own free joint."""
    physics = view(obj, "physics_body")
    return obj.parent is None and physics is not None and physics.text("mode") == "dynamic"


class Ids:
    """Unique object ids across the whole project, growing as copies take them."""

    def __init__(self, project: Project) -> None:
        self.taken = {obj.id for obj in all_objects(project)}

    def fresh(self, old: str) -> str:
        base = re.sub(r"_\d+$", "", old)[: ID_LENGTH - 5] or "object"
        number = 2
        while f"{base}_{number}" in self.taken:
            number += 1
        found = f"{base}_{number}"
        self.taken.add(found)
        return found


def _renamed(value, ids: dict[str, str]):
    if isinstance(value, ChoiceValue | ListValue | TextValue | AssetValue) and value.value in ids:
        return value.model_copy(update={"value": ids[value.value]})
    return value


def scaled_member(factor: float) -> Member:
    """An object inside a uniformly scaled group: its offset, own size and joint anchor grow by the factor."""

    def scale(obj: ObjectSpec) -> ObjectSpec:
        where = placement(obj)
        grown = Placement(
            rounded(np.multiply(where.position, factor)), where.rotation, rounded(np.multiply(where.scale, factor))
        )
        return with_vectors(placed(obj, grown), "joint", {"anchor": factor})

    return scale


def with_vectors(obj: ObjectSpec, kind: str, factors: dict[str, float | np.ndarray]) -> ObjectSpec:
    """The object with vector properties of one component multiplied (a number or one factor per axis)."""
    component = next((item for item in obj.components if item.kind == kind), None)
    shown = view(obj, kind)
    if component is None or shown is None:
        return obj
    properties = dict(component.properties)
    for prop, factor in factors.items():
        value = rounded(np.multiply(shown.vector(prop), factor))
        properties[prop] = VectorValue(type="vector", value=value)
    changed = component.model_copy(update={"properties": properties})
    return obj.model_copy(update={"components": [changed if c.id == component.id else c for c in obj.components]})


def tinted(obj: ObjectSpec, hue: float, light: float) -> ObjectSpec:
    """The object with its material color shifted in hue (turns) and lightness (fraction)."""
    component = next((item for item in obj.components if item.kind == "material"), None)
    color = component.properties.get("color") if component else None
    if component is None or not isinstance(color, ColorValue):
        return obj
    red, green, blue = (int(color.value[index : index + 2], 16) / 255 for index in (1, 3, 5))
    h, lightness, saturation = colorsys.rgb_to_hls(red, green, blue)
    rgb = colorsys.hls_to_rgb((h + hue) % 1.0, min(max(lightness * (1 + light), 0.0), 1.0), saturation)
    shifted = "#" + "".join(f"{round(channel * 255):02x}" for channel in rgb)
    properties = {**component.properties, "color": ColorValue(type="color", value=shifted)}
    changed = component.model_copy(update={"properties": properties})
    return obj.model_copy(update={"components": [changed if c.id == component.id else c for c in obj.components]})


@dataclass(frozen=True)
class Copy:
    root: Placement
    # Applied to every member after placing it, such as a color shift of one scattered copy.
    each: Member | None = None
    # Applied to the members inside the root only, such as a uniform scale or a mirror.
    inner: Member | None = None


def copy_operations(
    project: Project, source: str, copies: Iterable[Copy], ids: Ids, parent: str | None = None, suffix: bool = True
) -> tuple[list[EditOperation], list[str]]:
    """create_object operations for each copy of the source's subtree, and the ids of the copies' roots."""
    target, objects = container_of(project, source)
    members = subtree(objects, source)
    operations: list[EditOperation] = []
    roots: list[str] = []
    for number, copy in enumerate(copies, start=2):
        renamed = {obj.id: ids.fresh(obj.id) for obj in members}
        for obj in members:
            moved = placed(obj, copy.root) if obj.id == source else (copy.inner(obj) if copy.inner else obj)
            moved = copy.each(moved) if copy.each else moved
            components = [
                item.model_copy(update={"properties": {k: _renamed(v, renamed) for k, v in item.properties.items()}})
                for item in moved.components
            ]
            name = f"{obj.name} {number}" if suffix and obj.id == source else obj.name
            owner = (parent if parent is not None else obj.parent) if obj.id == source else renamed[obj.parent or ""]
            spec = ObjectSpec(id=renamed[obj.id], name=name[:NAME_LENGTH], parent=owner, components=components)
            operations.append(CreateObject(op="create_object", target=target, object=spec))
        roots.append(renamed[source])
    return operations, roots
