import pytest
from pydantic import TypeAdapter, ValidationError

from icarus.contracts.operations import EditOperation, SetCurriculum
from icarus.contracts.project import Project
from icarus.contracts.specs import CurriculumStage
from icarus.copilot.proposal_changes import proposal_changes
from icarus.projects.curriculum import stage_project
from icarus.projects.document import all_objects
from icarus.projects.operations import apply_operations
from icarus.projects.validation import validate_project
from tests.sim.conftest import project_from

OPERATION = TypeAdapter(EditOperation)


def _stages(*stages: dict) -> list[CurriculumStage]:
    return [CurriculumStage.model_validate(stage) for stage in stages]


def _with(project: Project, *stages: dict) -> Project:
    return apply_operations(project, [SetCurriculum(op="set_curriculum", stages=_stages(*stages))])


def _property(project: Project, kind: str, prop: str) -> object:
    component = next(c for obj in all_objects(project) for c in obj.components if c.kind == kind)
    return component.properties[prop].value  # type: ignore[union-attr]


def test_set_curriculum_arrives_as_json_and_replaces_the_stages():
    parking = project_from("parking_car")
    operation = OPERATION.validate_python(
        {
            "op": "set_curriculum",
            "stages": [
                {"name": "Close", "settings": [{"parameter": "goal_distance", "value": 2}]},
                {"name": "Far", "settings": [{"parameter": "goal_distance", "value": 8}], "promote": {"episodes": 50}},
            ],
        }
    )
    staged = apply_operations(parking, [operation])
    assert [stage.name for stage in staged.task.curriculum] == ["Close", "Far"]
    assert staged.task.curriculum[0].promote.success_rate == 0.8
    assert validate_project(staged) == []
    changes = proposal_changes(parking, [operation])
    assert (changes[0].before, changes[0].after) == ("One stage", "Close then Far")
    cleared = apply_operations(staged, [SetCurriculum(op="set_curriculum", stages=[])])
    assert cleared.task == parking.task


@pytest.mark.parametrize(
    "stage",
    [
        {"name": "Odd", "settings": [{"parameter": "obstacle_count", "value": 3}]},
        {"name": "Never", "promote": {"success_rate": 0}},
        {"name": "Endless", "promote": {"episodes": 0}},
        {"name": ""},
    ],
)
def test_the_contract_rejects_unknown_settings_and_impossible_promotions(stage):
    with pytest.raises(ValidationError):
        CurriculumStage.model_validate(stage)


def test_validation_reports_stage_values_out_of_range_repeated_or_without_their_part():
    parking = project_from("parking_car")
    issues = validate_project(
        _with(
            parking,
            {"name": "Far", "settings": [{"parameter": "goal_distance", "value": 80}]},
            {
                "name": "Twice",
                "settings": [{"parameter": "stop_speed", "value": 1}, {"parameter": "stop_speed", "value": 2}],
            },
            {"name": "Twice"},
            {"name": "Short", "settings": [{"parameter": "episode_seconds", "value": 1}]},
        )
    )
    paths = sorted(issue.path for issue in issues)
    assert paths == [
        "task.curriculum.0.goal_distance",
        "task.curriculum.1.stop_speed",
        "task.curriculum.2",
        "task.curriculum.3.episode_seconds",
    ]
    walker = project_from("walker_robot")
    lacking = validate_project(
        _with(walker, {"name": "Strict", "settings": [{"parameter": "align_within", "value": 10}]})
    )
    assert [issue.message for issue in lacking] == ["Strict: align_within needs a goal zone"]


def test_a_stage_applies_its_settings_to_the_task_and_world_and_leaves_one_stage():
    parking = project_from("parking_car")
    project = _with(
        parking,
        {
            "name": "Easy",
            "settings": [{"parameter": "stop_speed", "value": 2}, {"parameter": "episode_seconds", "value": 60}],
        },
        {"name": "Strict", "settings": [{"parameter": "align_within", "value": 15}]},
    )
    easy, strict = stage_project(project, 0), stage_project(project, 1)
    assert (easy.task.episode_seconds, _property(easy, "goal_zone", "stop_speed")) == (60, 2)
    assert strict.task.episode_seconds == parking.task.episode_seconds
    assert _property(strict, "goal_zone", "align_within") == 15
    assert easy.task.curriculum == [] and strict.task.curriculum == []
    # Past the last stage the run stays on it, and the stored project is never changed.
    assert stage_project(project, 5) == strict
    assert project.task.curriculum[0].name == "Easy"
    # A task without stages trains exactly as it is.
    assert stage_project(parking, 0) is parking
