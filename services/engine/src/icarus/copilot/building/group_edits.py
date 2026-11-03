"""Edits of a whole subtree (a group) and of every object a filter matches, as plain edit operations."""

from dataclasses import dataclass, field
from typing import Annotated, Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.operations import (
    AddComponent,
    CreateObject,
    DeleteObject,
    EditOperation,
    ReparentObject,
    SetProperty,
)
from icarus.contracts.project import Project
from icarus.contracts.properties import PropertyValue, Vector3
from icarus.copilot.building.copies import BuildError, Ids, container_of, is_free, scaled_member
from icarus.copilot.building.frames import (
    Placement,
    placed,
    placement,
    placement_problem,
    rotation_degrees,
    rotation_matrix,
    rounded,
    subtree,
)
from icarus.copilot.building.selection import Located
from icarus.library.components import UnknownKind, component_kind, default_component

IDENTITY = Placement((0.0, 0.0, 0.0), (0.0, 0.0, 0.0), (1.0, 1.0, 1.0))


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Move(_Strict):
    action: Literal["move"]
    offset: Vector3 | None = Field(default=None, description="Shift in metres, in the group's parent frame.")
    to: Vector3 | None = Field(default=None, description="New position of the group's origin; instead of offset.")


class Rotate(_Strict):
    action: Literal["rotate"]
    degrees: Vector3 = Field(description="Turn around the fixed X, then Y, then Z axes; [0, 0, 90] turns left.")
    pivot: Vector3 | None = Field(default=None, description="Point it turns around; none is the group's origin.")


class Scale(_Strict):
    action: Literal["scale"]
    factor: float = Field(gt=0.05, le=20, description="Uniform: sizes and the gaps inside the group grow by it.")


class MakeGroup(_Strict):
    action: Literal["make_group"]
    members: list[str] = Field(min_length=1, max_length=100, description="Objects sharing one parent.")
    name: str = Field(min_length=1, max_length=80)


class Ungroup(_Strict):
    action: Literal["ungroup"]


type GroupChange = Annotated[Move | Rotate | Scale | MakeGroup | Ungroup, Field(discriminator="action")]


@dataclass
class Edits:
    operations: list[EditOperation]
    touched: list[str]
    notes: list[str] = field(default_factory=list)


def transform_operations(obj: ObjectSpec, moved: Placement) -> list[EditOperation]:
    """set_property for each transform value that changes, or add_component when the object has no transform."""
    problem = placement_problem(obj.name, moved)
    if problem:
        raise BuildError(problem)
    fresh = placed(obj, moved).components[0]
    current = next((item for item in obj.components if item.kind == "transform"), None)
    if current is None:
        return [AddComponent(op="add_component", object=obj.id, component=fresh)]
    before = placement(obj)
    return [
        SetProperty(op="set_property", object=obj.id, component=current.id, property=prop, value=fresh.properties[prop])
        for prop, old in (("position", before.position), ("rotation", before.rotation), ("scale", before.scale))
        if not np.allclose(old, fresh.properties[prop].model_dump()["value"], atol=1e-6)
    ]


def _member_operations(old: ObjectSpec, new: ObjectSpec) -> list[EditOperation]:
    """set_property for every property of `new` that differs from `old` (same components, changed values)."""
    operations: list[EditOperation] = []
    for component in new.components:
        before = next((item for item in old.components if item.id == component.id), None)
        if before is None:
            operations.append(AddComponent(op="add_component", object=old.id, component=component))
            continue
        for prop, value in component.properties.items():
            if before.properties.get(prop) != value:
                operations.append(
                    SetProperty(op="set_property", object=old.id, component=component.id, property=prop, value=value)
                )
    return operations


def _object(project: Project, object_id: str) -> tuple[ObjectSpec, list[ObjectSpec]]:
    _, objects = container_of(project, object_id)
    return next(obj for obj in objects if obj.id == object_id), objects


def edit_group(project: Project, root: str, change: GroupChange) -> Edits:
    obj, objects = _object(project, root)
    where = placement(obj)
    members = subtree(objects, root)
    match change:
        case Move(offset=offset, to=to):
            if (offset is None) == (to is None):
                raise BuildError("Give either offset or to, not both")
            spot = to if to is not None else rounded(np.add(where.position, offset or (0, 0, 0)))
            return Edits(transform_operations(obj, Placement(spot, where.rotation, where.scale)), [root])
        case Rotate(degrees=degrees, pivot=pivot):
            turn = rotation_matrix(degrees)
            center = np.asarray(pivot if pivot is not None else where.position)
            spot = rounded(center + turn @ (np.asarray(where.position) - center))
            turned = Placement(spot, rotation_degrees(turn @ rotation_matrix(where.rotation)), where.scale)
            return Edits(transform_operations(obj, turned), [root])
        case Scale(factor=factor):
            grown = Placement(where.position, where.rotation, rounded(np.multiply(where.scale, factor)))
            operations = transform_operations(obj, grown)
            inner = scaled_member(factor)
            for member in members[1:]:
                scaled = inner(member)
                if problem := placement_problem(member.name, placement(scaled)):
                    raise BuildError(problem)
                operations += _member_operations(member, scaled)
            anchor = scaled_member(factor)(obj)
            joint = next((c for c in anchor.components if c.kind == "joint"), None)
            if joint is not None:
                operations += _member_operations(obj, obj.model_copy(update={"components": [joint]}))
            return Edits(operations, [member.id for member in members])
        case MakeGroup(members=ids, name=name):
            return _make_group(project, root, ids, name)
        case Ungroup():
            return _ungroup(obj, objects)


def _make_group(project: Project, near: str, ids: list[str], name: str) -> Edits:
    target, objects = container_of(project, near)
    found = {obj.id: obj for obj in objects}
    missing = [item for item in ids if item not in found]
    if missing:
        raise BuildError(f"These are not objects next to {near}: {', '.join(missing)}")
    chosen = [found[item] for item in dict.fromkeys(ids)]
    parents = {obj.parent for obj in chosen}
    if len(parents) != 1:
        raise BuildError("Members of a group must share one parent; group the ones that do")
    if free := [obj.name for obj in chosen if is_free(obj)]:
        raise BuildError(f"{', '.join(free)} move freely and must stay at the top level, outside any group")
    middle = rounded(np.mean([placement(obj).position for obj in chosen], axis=0))
    group = placed(
        ObjectSpec(id=Ids(project).fresh(f"{chosen[0].id}_group"), name=name, parent=parents.pop(), components=[]),
        Placement(middle, IDENTITY.rotation, IDENTITY.scale),
    )
    operations: list[EditOperation] = [CreateObject(op="create_object", target=target, object=group)]
    for obj in chosen:
        where = placement(obj)
        operations.append(ReparentObject(op="reparent_object", object=obj.id, parent=group.id))
        inside = Placement(rounded(np.subtract(where.position, middle)), where.rotation, where.scale)
        operations += transform_operations(obj, inside)
    return Edits(operations, [group.id, *(obj.id for obj in chosen)])


def _ungroup(group: ObjectSpec, objects: list[ObjectSpec]) -> Edits:
    if any(item.kind != "transform" for item in group.components):
        raise BuildError(f"{group.name} has a shape or other components; only a transform-only group can be ungrouped")
    where = placement(group)
    turn = rotation_matrix(where.rotation)
    operations: list[EditOperation] = []
    children = [obj for obj in objects if obj.parent == group.id]
    for child in children:
        inner = placement(child)
        spot = rounded(np.asarray(where.position) + turn @ np.asarray(inner.position))
        moved = Placement(spot, rotation_degrees(turn @ rotation_matrix(inner.rotation)), inner.scale)
        operations += transform_operations(child, moved)
        operations.append(ReparentObject(op="reparent_object", object=child.id, parent=group.parent))
    operations.append(DeleteObject(op="delete_object", object=group.id))
    return Edits(operations, [child.id for child in children])


class PropertyChange(_Strict):
    component: str = Field(description="Component kind, such as material; the object's first one of that kind.")
    property: str = Field(min_length=1, max_length=40)
    value: PropertyValue


@dataclass
class Batch:
    operations: list[EditOperation]
    edited: list[str]
    lacking: list[str] = field(default_factory=list)
    capped: int = 0


def edit_matching(
    matched: list[Located], changes: list[PropertyChange], add_missing: bool, limit: int, room: int
) -> Batch:
    """set_property for every change on every matched object, capped by `limit` objects and `room` operations."""
    for change in changes:
        try:
            schema = {prop.id for prop in component_kind(change.component).properties}
        except UnknownKind as error:
            raise BuildError(f"`{change.component}` is not a library component kind") from error
        if change.property not in schema:
            raise BuildError(
                f"{change.component} has no property `{change.property}`; it has {', '.join(sorted(schema))}"
            )
    batch = Batch([], [])
    for item in matched:
        obj = item.obj
        planned: list[EditOperation] = []
        for change in changes:
            current = next((c for c in obj.components if c.kind == change.component), None)
            if current is None and not add_missing:
                planned = []
                break
            if current is None:
                current = default_component(change.component, change.component)
                if any(c.id == current.id for c in obj.components):
                    current = default_component(change.component, f"{change.component}_2")
                planned.append(AddComponent(op="add_component", object=obj.id, component=current))
            planned.append(
                SetProperty(
                    op="set_property", object=obj.id, component=current.id, property=change.property, value=change.value
                )
            )
        if not planned:
            batch.lacking.append(obj.id)
            continue
        if len(batch.edited) >= limit or len(batch.operations) + len(planned) > room:
            batch.capped += 1
            continue
        batch.operations += planned
        batch.edited.append(obj.id)
    return batch
