import os

import pytest

from icarus.contracts.operations import OperationBatch, SetProperty
from icarus.contracts.properties import NumberValue
from icarus.projects.store import NothingToRedo, NothingToUndo, ProjectStore, RejectedBatch, UnknownProject


def mass_batch(value: float) -> OperationBatch:
    return OperationBatch(
        operations=[
            SetProperty(
                op="set_property",
                object="car",
                component="physics_body",
                property="mass",
                value=NumberValue(type="number", value=value),
            )
        ],
        summary=f"Mass {value}",
    )


def car_mass(state) -> float:
    car = next(obj for body in state.project.bodies for obj in body.objects if obj.id == "car")
    mass = next(component for component in car.components if component.kind == "physics_body").properties["mass"]
    assert isinstance(mass, NumberValue)
    return mass.value


@pytest.fixture
def store(tmp_path) -> ProjectStore:
    return ProjectStore(tmp_path)


@pytest.fixture
def project_id(store) -> str:
    return store.create("Parking", "parking_car").project.id


def test_creating_from_a_template_gives_revision_one(store):
    state = store.create("Parking", "parking_car")
    assert state.revision.number == 1
    assert state.report.ok
    assert not state.can_undo
    assert [summary.name for summary in store.list_projects()] == ["Parking"]


def test_a_batch_becomes_the_next_revision(store, project_id):
    state = store.apply(project_id, mass_batch(1200))
    assert state.revision.number == 2
    assert car_mass(state) == 1200
    assert state.can_undo


def test_an_out_of_range_value_is_rejected_and_nothing_changes(store, project_id):
    store.apply(project_id, mass_batch(1200))
    with pytest.raises(RejectedBatch) as error:
        store.apply(project_id, mass_batch(-1))
    assert error.value.issues[0].path.endswith("physics_body.mass")
    assert store.state(project_id).revision.number == 2


def test_undo_and_redo_walk_the_history(store, project_id):
    store.apply(project_id, mass_batch(1200))
    assert car_mass(store.undo(project_id)) == 900
    assert car_mass(store.redo(project_id)) == 1200


def test_editing_after_undo_drops_the_redo_branch_but_keeps_the_log(store, project_id):
    store.apply(project_id, mass_batch(1200))
    store.undo(project_id)
    state = store.apply(project_id, mass_batch(1500))
    assert state.revision.number == 3
    assert state.revision.parent == 1
    assert not state.can_redo
    assert [revision.number for revision in store.revisions(project_id)] == [1, 2, 3]
    with pytest.raises(NothingToRedo):
        store.redo(project_id)


def test_nothing_to_undo_at_the_first_revision(store, project_id):
    with pytest.raises(NothingToUndo):
        store.undo(project_id)


def test_a_failed_head_move_keeps_the_previous_revision(store, project_id, monkeypatch):
    real_replace = os.replace

    def failing_replace(source, target):
        if str(target).endswith("head.json"):
            raise OSError("disk full")
        real_replace(source, target)

    monkeypatch.setattr(os, "replace", failing_replace)
    with pytest.raises(OSError):
        store.apply(project_id, mass_batch(1200))
    monkeypatch.setattr(os, "replace", real_replace)
    state = store.state(project_id)
    assert state.revision.number == 1
    assert car_mass(state) == 900


@pytest.mark.parametrize("bad", ["../etc", "nope", "0123456789AB", ""])
def test_ids_that_are_not_engine_ids_are_unknown(store, bad):
    with pytest.raises(UnknownProject):
        store.state(bad)
