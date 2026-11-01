import pytest

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.operations import CreateObject, DeleteObject, RenameObject, SetProperty
from icarus.contracts.properties import NumberValue
from icarus.projects.operations import OperationError, apply_operations
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
