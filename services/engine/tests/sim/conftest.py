import pytest

from icarus.contracts.operations import CreateObject, EditOperation, RemoveRewardTerm, SetRewardTerm, SetTaskFamily
from icarus.contracts.project import Project
from icarus.contracts.specs import RewardTermSpec
from icarus.library.templates import Part, template_operations
from icarus.projects.operations import apply_operations, empty_project


def project_from(template: str) -> Project:
    return apply_operations(empty_project("0123456789ab", "Test"), template_operations(template))


def walker_navigation() -> Project:
    """The walker sent to a finish 10 m ahead, keeping the terms that hold it up."""
    finish = Part("finish", "Finish", None, {"transform": {"position": (10, 0, 0)}, "goal_zone": {"radius": 1.0}})
    operations: list[EditOperation] = [
        CreateObject(op="create_object", target="world", object=finish.spec()),
        SetTaskFamily(op="set_task_family", family="navigation"),
        RemoveRewardTerm(op="remove_reward_term", term="forward_progress"),
    ]
    operations += [
        SetRewardTerm(op="set_reward_term", term=RewardTermSpec(term=term, weight=weight))
        for term, weight in (("progress_to_goal", 1.0), ("reach_goal", 10.0))
    ]
    return apply_operations(project_from("walker_robot"), operations)


@pytest.fixture
def parking() -> Project:
    return project_from("parking_car")


@pytest.fixture
def walker() -> Project:
    return project_from("walker_robot")
