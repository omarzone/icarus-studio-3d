import math

import pytest
from pydantic import TypeAdapter

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.operations import CreateObject
from icarus.contracts.project import Project
from icarus.contracts.properties import PropertyValue
from icarus.design.compiler import CompileError, compile_project
from icarus.library.components import default_component
from icarus.projects.operations import apply_operations, empty_project

VALUE = TypeAdapter(PropertyValue)


def part(id: str, parent: str | None, **overrides: dict[str, dict]) -> ObjectSpec:
    components = []
    for kind, props in overrides.items():
        component = default_component(kind, kind)
        for prop, value in props.items():
            component.properties[prop] = VALUE.validate_python(value)
        components.append(component)
    return ObjectSpec(id=id, name=id.capitalize(), parent=parent, components=components)


def project_of(*parts: ObjectSpec) -> Project:
    operations = [CreateObject(op="create_object", target="world", object=item) for item in parts]
    return apply_operations(empty_project("0123456789ab", "T"), operations)


def box(id: str = "box", parent: str | None = None, **extra: dict[str, dict]) -> ObjectSpec:
    return part(
        id,
        parent,
        transform={"position": {"type": "vector", "value": [0, 0, 1]}},
        mesh={"size": {"type": "vector", "value": [0.2, 0.2, 0.2]}},
        physics_body={"mass": {"type": "number", "value": 2}},
        **extra,
    )


def test_an_empty_project_compiles_to_an_empty_world():
    compiled = compile_project(project_of())
    assert compiled.model.nbody == 1


def test_a_dynamic_box_keeps_its_mass_and_gets_inertia():
    compiled = compile_project(project_of(box()))
    body = compiled.model.body(compiled.objects["box"])
    assert body.mass[0] == pytest.approx(2)
    assert all(value > 0 for value in body.inertia)


def test_hinge_limits_become_radians_and_motors_become_actuators():
    arm = part(
        "arm",
        "box",
        transform={"position": {"type": "vector", "value": [0, 0, -0.3]}},
        mesh={"size": {"type": "vector", "value": [0.1, 0.1, 0.3]}},
        physics_body={"mass": {"type": "number", "value": 1}},
        joint={"limits": {"type": "range", "low": -45, "high": 45}},
        motor={"kind": {"type": "choice", "value": "position"}},
    )
    compiled = compile_project(project_of(box(), arm))
    hinge = next(index for index in range(compiled.model.njnt) if compiled.model.jnt_type[index] == 3)
    assert compiled.model.jnt_range[hinge][1] == pytest.approx(math.radians(45))
    assert compiled.model.nu == 1
    assert compiled.model.actuator_ctrlrange[0][1] == pytest.approx(math.radians(45))


def test_a_zero_size_part_fails_with_its_name():
    flat = part(
        "flat",
        None,
        transform={},
        mesh={"shape": {"type": "list", "value": "sphere"}, "size": {"type": "vector", "value": [0, 0, 0]}},
    )
    with pytest.raises(CompileError) as error:
        compile_project(project_of(flat))
    assert "Flat" in error.value.reason
