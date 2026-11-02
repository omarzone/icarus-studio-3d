import pytest

from icarus.contracts.operations import (
    AddComponent,
    DeleteObject,
    ReparentObject,
    SetProperty,
    SetRewardTerm,
    SetTaskFamily,
)
from icarus.contracts.project import Project
from icarus.contracts.properties import AssetValue, NumberValue
from icarus.contracts.specs import RewardTermSpec
from icarus.library.components import default_component
from icarus.library.templates import TEMPLATES, template_operations
from icarus.projects.operations import apply_operations, empty_project
from icarus.projects.validation import validate_project
from tests.sim.conftest import project_from, pusher, walker_navigation, with_term


def point_motor_at_arm(project):
    return apply_operations(
        project,
        [
            SetProperty(
                op="set_property",
                object="drive",
                component="motor",
                property="joint",
                value=AssetValue(type="asset", value="arm"),
            )
        ],
    )


def test_a_valid_project_has_no_issues(base):
    assert validate_project(point_motor_at_arm(base)) == []


def test_motor_without_a_joint_is_reported(base):
    project = apply_operations(point_motor_at_arm(base), [DeleteObject(op="delete_object", object="arm")])
    paths = [issue.path for issue in validate_project(project)]
    assert "objects.drive.components.motor.joint" in paths


def test_parent_cycle_names_both_objects(base):
    project = apply_operations(base, [ReparentObject(op="reparent_object", object="car", parent="arm")])
    messages = " ".join(issue.message for issue in validate_project(project))
    assert "car" in messages
    assert "arm" in messages


def test_negative_mass_is_reported_at_its_property(base):
    project = apply_operations(
        point_motor_at_arm(base),
        [
            SetProperty(
                op="set_property",
                object="car",
                component="physics_body",
                property="mass",
                value=NumberValue(type="number", value=-1),
            )
        ],
    )
    assert [issue.path for issue in validate_project(project)] == ["objects.car.components.physics_body.mass"]


def test_reward_term_from_another_family_is_reported(base):
    project = apply_operations(
        point_motor_at_arm(base),
        [
            SetTaskFamily(op="set_task_family", family="navigation"),
            SetRewardTerm(op="set_reward_term", term=RewardTermSpec(term="forward_progress", weight=1)),
        ],
    )
    assert [issue.path for issue in validate_project(project)] == ["task.rewards.forward_progress"]


def test_a_walker_sent_to_a_finish_keeps_its_upright_fall_and_energy_terms():
    project = walker_navigation()
    assert validate_project(project) == []
    assert {"stay_upright", "fall_penalty", "energy_cost"} <= {term.term for term in project.task.rewards}


@pytest.mark.parametrize("template", list(TEMPLATES))
def test_every_template_builds_a_valid_project(template):
    project = apply_operations(empty_project("0123456789ab", "T"), template_operations(template))
    assert validate_project(project) == []


def randomize_on(object_id: str):
    return AddComponent(op="add_component", object=object_id, component=default_component("randomize", "randomize"))


def test_randomize_per_copy_is_accepted_on_a_world_object_and_refused_on_a_body_part():
    project = apply_operations(empty_project("0123456789ab", "Test"), template_operations("parking_car"))
    assert validate_project(apply_operations(project, [randomize_on("ground")])) == []
    issues = validate_project(apply_operations(project, [randomize_on("car")]))
    assert [issue.path for issue in issues] == ["objects.car.components.randomize"]
    assert "world" in issues[0].message


def object_term(target: str | None) -> Project:
    project = pusher()
    params = {} if target is None else {"object": {"type": "asset", "value": target}}
    return with_term(project, "object_to_goal", 1.0, **params)


def test_a_crate_pushed_to_the_goal_is_valid():
    assert validate_project(pusher()) == []


@pytest.mark.parametrize(
    ("target", "words"),
    [(None, "needs an object"), ("nowhere", "does not exist"), ("ground", "fixed"), ("car", "body")],
)
def test_object_to_goal_needs_an_existing_movable_world_object(target, words):
    issues = validate_project(object_term(target))
    assert [issue.path for issue in issues] == ["task.rewards.object_to_goal.params.object"]
    assert words in issues[0].message


def test_coverage_cell_size_is_checked_against_its_range_and_unknown_settings_are_refused():
    project = project_from("parking_car")
    good = with_term(project, "coverage", 1.0, cell_size={"type": "number", "value": 1.0})
    assert validate_project(good) == []
    tiny = with_term(project, "coverage", 1.0, cell_size={"type": "number", "value": 0.001})
    assert [issue.path for issue in validate_project(tiny)] == ["task.rewards.coverage.params.cell_size"]
    odd = with_term(project, "coverage", 1.0, speed={"type": "number", "value": 1.0})
    assert [issue.path for issue in validate_project(odd)] == ["task.rewards.coverage.params.speed"]
