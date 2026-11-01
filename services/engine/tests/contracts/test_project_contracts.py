import pytest
from pydantic import TypeAdapter, ValidationError

from icarus.contracts.objects import ComponentSpec, ObjectSpec
from icarus.contracts.operations import EditOperation, SetProperty
from icarus.contracts.project import BrainSpec, Project, TaskSpec, WorldSpec
from icarus.contracts.properties import NumberValue, PropertyValue

OPERATION = TypeAdapter(EditOperation)
VALUE = TypeAdapter(PropertyValue)


def sample_project() -> Project:
    box = ObjectSpec(
        id="box",
        name="Box",
        parent=None,
        components=[
            ComponentSpec(id="physics", kind="physics_body", properties={"mass": NumberValue(type="number", value=2)})
        ],
    )
    return Project(
        id="0123456789ab",
        name="Sample",
        schema_version=1,
        world=WorldSpec(objects=[box]),
        bodies=[],
        task=TaskSpec(family="none", rewards=[]),
        brain=BrainSpec(template=None, copies=1, seed=0),
    )


def test_project_round_trips_through_json():
    project = sample_project()
    assert Project.model_validate_json(project.model_dump_json()) == project


def test_operations_parse_by_their_op_name():
    operation = OPERATION.validate_python(
        {
            "op": "set_property",
            "object": "box",
            "component": "physics",
            "property": "mass",
            "value": {"type": "number", "value": 3},
        }
    )
    assert isinstance(operation, SetProperty)


@pytest.mark.parametrize(
    "build",
    [
        lambda: ObjectSpec(id="a", name="", parent=None, components=[]),
        lambda: BrainSpec(template=None, copies=0, seed=0),
        lambda: ObjectSpec.model_validate({"id": "a", "name": "A", "parent": None, "components": [], "extra": 1}),
    ],
)
def test_invalid_documents_are_rejected(build):
    with pytest.raises(ValidationError):
        build()


@pytest.mark.parametrize(
    "value",
    [
        {"type": "vector", "value": [1, 2]},
        {"type": "color", "value": "red"},
    ],
)
def test_malformed_property_values_are_rejected(value):
    with pytest.raises(ValidationError):
        VALUE.validate_python(value)
