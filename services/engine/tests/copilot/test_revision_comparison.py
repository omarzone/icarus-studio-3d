import pytest

from icarus.contracts.operations import (
    OperationBatch,
    RemoveComponent,
    RemoveRewardTerm,
    RenameObject,
    SetProperty,
    SetRewardTerm,
)
from icarus.contracts.properties import NumberValue
from icarus.contracts.specs import RewardTermSpec
from icarus.copilot.revision_comparison import compare_revisions
from icarus.projects.store import ProjectStore, UnknownRevision


@pytest.fixture
def store(tmp_path) -> ProjectStore:
    return ProjectStore(tmp_path)


def test_two_revisions_are_compared_object_by_object_and_term_by_term(store):
    state = store.create("Parking", "parking_car")
    project_id = state.project.id
    store.apply(
        project_id,
        OperationBatch(
            operations=[
                SetProperty(
                    op="set_property",
                    object="car",
                    component="physics_body",
                    property="mass",
                    value=NumberValue(type="number", value=1200),
                ),
                RenameObject(op="rename_object", object="car", name="Racer"),
                RemoveComponent(op="remove_component", object="car", component="distance_ray"),
            ],
            summary="Heavier racer",
        ),
    )
    store.apply(
        project_id,
        OperationBatch(
            operations=[
                SetRewardTerm(op="set_reward_term", term=RewardTermSpec(term="reach_goal", weight=20)),
                RemoveRewardTerm(op="remove_reward_term", term="time_penalty"),
            ],
            summary="Rewards",
        ),
    )
    comparison = compare_revisions(store, project_id, 1, 3)
    assert (comparison.a, comparison.b) == (1, 3)
    assert [(change.label, change.before, change.after) for change in comparison.objects] == [
        ("Name of Car", "Car", "Racer")
    ]
    assert [(change.label, change.after) for change in comparison.components] == [("Distance ray on Racer", "Removed")]
    mass = [change for change in comparison.properties if change.label.startswith("Mass on Racer")]
    assert len(comparison.properties) == 1 and mass and mass[0].before == "900 kg" and mass[0].after == "1200 kg"
    rewards = {change.label: (change.before, change.after) for change in comparison.rewards}
    assert rewards["Reward: Reach the goal"] == ("10", "20")
    assert rewards["Reward: Be quick"] == ("-0.01", "Removed")
    assert comparison.other == []


def test_comparing_a_revision_with_itself_finds_nothing(store):
    state = store.create("Parking", "parking_car")
    comparison = compare_revisions(store, state.project.id, 1, 1)
    assert (comparison.objects, comparison.components, comparison.properties, comparison.rewards) == ([], [], [], [])


def test_an_unknown_revision_is_rejected(store):
    state = store.create("Parking", "parking_car")
    with pytest.raises(UnknownRevision):
        compare_revisions(store, state.project.id, 1, 7)
