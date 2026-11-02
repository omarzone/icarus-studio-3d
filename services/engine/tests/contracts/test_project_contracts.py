from datetime import UTC, datetime

import pytest
from pydantic import TypeAdapter, ValidationError

from icarus.contracts.objects import ComponentSpec, ObjectSpec
from icarus.contracts.operations import EditOperation, RenameProject, SetBrain, SetProperty
from icarus.contracts.project import BrainSpec, Project, Revision, TaskSpec, WorldSpec
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


def test_older_documents_get_an_empty_description():
    data = sample_project().model_dump()
    del data["description"]
    assert Project.model_validate(data).description == ""


def test_older_brains_keep_the_settings_they_trained_with():
    data = sample_project().model_dump()
    data["brain"] = {"template": None, "copies": 4, "seed": 2}
    brain = Project.model_validate(data).brain
    assert (brain.algorithm, brain.training_steps, brain.layers) == ("ppo", None, [256, 256])
    assert (brain.ppo.learning_rate, brain.ppo.n_steps, brain.ppo.batch_size) == (3e-4, 1024, 2048)


@pytest.mark.parametrize(
    "fields",
    [
        {"algorithm": "sac"},
        {"training_steps": 500},
        {"layers": [4]},
        {"ppo": {"learning_rate": 0.5}},
        {"ppo": {"clip": 0.1}},
    ],
)
def test_brain_settings_outside_what_trains_are_rejected(fields):
    with pytest.raises(ValidationError):
        OPERATION.validate_python({"op": "set_brain", **fields})


def test_training_steps_can_go_back_to_the_recommended_budget():
    operation = OPERATION.validate_python({"op": "set_brain", "training_steps": "recommended"})
    assert isinstance(operation, SetBrain)
    assert operation.training_steps == "recommended"


def test_rename_carries_an_optional_description():
    operation = OPERATION.validate_python({"op": "rename_project", "name": "Lot", "description": "A parking lot"})
    assert isinstance(operation, RenameProject)
    assert operation.description == "A parking lot"


def test_revisions_are_not_restored_by_default():
    revision = Revision(number=1, parent=None, author="user", summary="s", operations=[], created_at=datetime.now(UTC))
    assert revision.restored_from is None


def test_play_commands_and_messages_parse_by_their_tag():
    from icarus.contracts.play import PlayCommandEnvelope, PlayMessageEnvelope, PushCommand

    command = PlayCommandEnvelope.model_validate(
        {"command": {"tool": "push", "object": "car", "direction": [1, 0, 0], "speed": 1}}
    )
    assert isinstance(command.command, PushCommand)
    with pytest.raises(ValidationError):
        PlayCommandEnvelope.model_validate({"command": {"tool": "speed", "speed": 9}})
    message = PlayMessageEnvelope.model_validate({"message": {"type": "error", "message": "x"}})
    assert message.message.type == "error"
