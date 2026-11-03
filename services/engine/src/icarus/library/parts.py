from dataclasses import dataclass, field

from pydantic import TypeAdapter

from icarus.contracts.objects import ComponentSpec, ObjectSpec
from icarus.contracts.properties import PropertyValue
from icarus.library.components import component_kind, default_component

_VALUE = TypeAdapter(PropertyValue)

Raw = float | int | bool | str | tuple[float, ...]


def _component(kind: str, overrides: dict[str, Raw]) -> ComponentSpec:
    component = default_component(kind, kind)
    schemas = {schema.id: schema for schema in component_kind(kind).properties}
    for prop, raw in overrides.items():
        schema = schemas[prop]
        if schema.type == "range" and isinstance(raw, tuple):
            component.properties[prop] = _VALUE.validate_python({"type": "range", "low": raw[0], "high": raw[1]})
        else:
            component.properties[prop] = _VALUE.validate_python({"type": schema.type, "value": raw})
    return component


@dataclass
class Part:
    id: str
    name: str
    parent: str | None
    components: dict[str, dict[str, Raw]] = field(default_factory=dict)

    def spec(self) -> ObjectSpec:
        return ObjectSpec(
            id=self.id,
            name=self.name,
            parent=self.parent,
            components=[_component(kind, overrides) for kind, overrides in self.components.items()],
        )


def solid(
    id: str,
    name: str,
    parent: str | None,
    position: tuple[float, float, float],
    shape: str,
    size: tuple[float, float, float],
    mass: float,
    color: str,
    *,
    rotation: tuple[float, float, float] = (0, 0, 0),
    extra: dict[str, dict[str, Raw]] | None = None,
    style: str = "plain",
) -> Part:
    components: dict[str, dict[str, Raw]] = {
        "transform": {"position": position, "rotation": rotation},
        "mesh": {"shape": shape, "size": size},
        "material": {"color": color, "style": style},
        "physics_body": {"mode": "dynamic", "mass": mass},
        "collider": {},
    }
    return Part(id, name, parent, components | (extra or {}))


def fixture(
    id: str,
    name: str,
    parent: str | None,
    position: tuple[float, float, float],
    shape: str,
    size: tuple[float, float, float],
    color: str,
    *,
    style: str = "plain",
    surface: str = "concrete",
    rotation: tuple[float, float, float] = (0, 0, 0),
) -> Part:
    """A static part that things bump into."""
    part = solid(id, name, parent, position, shape, size, 1, color, rotation=rotation, style=style)
    part.components["physics_body"] = {"mode": "static"}
    part.components["material"] |= {"surface": surface}
    return part


def decoration(
    id: str,
    name: str,
    parent: str | None,
    position: tuple[float, float, float],
    shape: str,
    size: tuple[float, float, float],
    color: str,
    *,
    style: str = "plain",
    rotation: tuple[float, float, float] = (0, 0, 0),
) -> Part:
    """A static part without physics or collider: drawn on the world, nothing ever touches it."""
    components: dict[str, dict[str, Raw]] = {
        "transform": {"position": position, "rotation": rotation},
        "mesh": {"shape": shape, "size": size},
        "material": {"color": color, "style": style},
    }
    return Part(id, name, parent, components)


def hinge(axis: tuple[float, float, float], limits: tuple[float, float], anchor=(0.0, 0.0, 0.0)) -> dict[str, Raw]:
    return {"kind": "hinge", "axis": axis, "limits": limits, "anchor": anchor}


def motor(kind: str, max_force: float) -> dict[str, Raw]:
    return {"kind": kind, "max_force": max_force}
