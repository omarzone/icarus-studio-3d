import pytest

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.operations import CreateObject, DeleteObject, PpoPatch, RenameObject, SetBrain, SetProperty
from icarus.contracts.properties import NumberValue
from icarus.projects.operations import OperationError, apply_operations
from icarus.projects.validation import validate_project
from tests.sim.conftest import project_from


def mass_of(project, object_id):
    obj = next(item for item in project.world.objects if item.id == object_id)
    return next(c for c in obj.components if c.kind == "physics_body").properties["mass"]


def test_set_property_changes_only_that_value_and_keeps_the_input(base):
    changed = apply_operations(
        base,
        [
            SetProperty(
                op="set_property",
                object="car",
                component="physics_body",
                property="mass",
                value=NumberValue(type="number", value=900),
            )
        ],
    )
    assert mass_of(changed, "car") == NumberValue(type="number", value=900)
    assert mass_of(base, "car") == NumberValue(type="number", value=1)
    assert mass_of(changed, "arm") == mass_of(base, "arm")


def test_set_brain_changes_only_the_settings_it_names():
    parking = project_from("parking_car")
    changed = apply_operations(
        parking,
        [SetBrain(op="set_brain", layers=[64, 64], training_steps=200_000, ppo=PpoPatch(learning_rate=1e-3))],
    )
    brain = changed.brain
    assert (brain.layers, brain.training_steps, brain.ppo.learning_rate) == ([64, 64], 200_000, 1e-3)
    assert (brain.copies, brain.seed, brain.ppo.n_steps) == (parking.brain.copies, parking.brain.seed, 1024)
    back = apply_operations(changed, [SetBrain(op="set_brain", training_steps="recommended")])
    assert back.brain.training_steps is None and back.brain.layers == [64, 64]


def test_a_brain_with_too_many_layers_is_reported():
    parking = project_from("parking_car")
    changed = apply_operations(parking, [SetBrain(op="set_brain", layers=[64] * 5)])
    assert [issue.path for issue in validate_project(changed)] == ["brain.layers"]


def test_deleting_a_parent_removes_its_children(base):
    changed = apply_operations(base, [DeleteObject(op="delete_object", object="car")])
    assert changed.world.objects == []


def test_operations_on_missing_objects_report_an_issue(base):
    with pytest.raises(OperationError) as error:
        apply_operations(base, [RenameObject(op="rename_object", object="ghost", name="Ghost")])
    assert error.value.issues[0].path == "objects.ghost"


def test_creating_an_object_in_a_missing_body_names_the_valid_targets():
    parking = project_from("parking_car")
    box = ObjectSpec(id="parked_left", name="Parked car", parent=None, components=[])
    with pytest.raises(OperationError) as error:
        apply_operations(parking, [CreateObject(op="create_object", target="parked_left", object=box)])
    message = error.value.issues[0].message
    assert "'parked_left'" in message and '"world"' in message and "car_body" in message


def test_the_same_operations_can_be_applied_twice_because_applying_never_changes_them():
    from icarus.contracts.operations import AddBody
    from icarus.contracts.specs import BodySpec
    from icarus.projects.operations import empty_project

    part = ObjectSpec(id="chassis", name="Chassis", parent=None, components=[])
    operations = [
        AddBody(op="add_body", body=BodySpec(id="rover", name="Rover", objects=[])),
        CreateObject(op="create_object", target="rover", object=part),
    ]
    first = apply_operations(empty_project("000000000000", "a"), operations)
    second = apply_operations(empty_project("000000000000", "b"), operations)
    assert [obj.id for obj in second.bodies[0].objects] == ["chassis"]
    assert first.bodies[0].objects[0] is not part and operations[0].body.objects == []
