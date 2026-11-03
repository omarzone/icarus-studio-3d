from pathlib import Path

import pytest

from icarus.contracts.operations import CreateObject, EditOperation, RemoveRewardTerm, SetRewardTerm, SetTaskFamily
from icarus.contracts.project import Project
from icarus.contracts.specs import RewardTermSpec
from icarus.library.pieces import PIECES
from icarus.library.templates import Part, template_operations
from icarus.projects.operations import apply_operations, empty_project

FIXTURES = Path(__file__).parent / "fixtures"


def project_from(template: str) -> Project:
    return apply_operations(empty_project("0123456789ab", "Test"), template_operations(template))


def raw_parking() -> Project:
    """The parking car as stored before vehicles: two steering motors, two rear torque motors, a circular goal."""
    return Project.model_validate_json((FIXTURES / "raw_motor_parking.json").read_text(encoding="utf-8"))


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
    return raw_parking()


@pytest.fixture
def walker() -> Project:
    return project_from("walker_robot")


def with_term(project: Project, term: str, weight: float, **params) -> Project:
    """The project with one more reward term; params are raw property values such as {"type": "asset", ...}."""
    spec = RewardTermSpec.model_validate({"term": term, "weight": weight, "params": params})
    return apply_operations(project, [SetRewardTerm(op="set_reward_term", term=spec)])


def pusher() -> Project:
    """The parking car with a movable crate 3 m ahead that it must push into the parking spot."""
    crate = PIECES["box"].object.model_copy(update={"id": "crate", "name": "Crate"})
    add = CreateObject(op="create_object", target="world", object=crate)
    project = apply_operations(raw_parking(), [add])
    return with_term(project, "object_to_goal", 1.0, object={"type": "asset", "value": "crate"})
