from icarus.contracts.errors import ValidationIssue
from icarus.contracts.project import Project
from icarus.contracts.properties import NumberValue
from icarus.contracts.specs import (
    MAX_EPISODE_SECONDS,
    MIN_EPISODE_SECONDS,
    CurriculumParameter,
    StageSetting,
    TaskSpec,
)
from icarus.library.components import COMPONENTS
from icarus.library.properties import check_value
from icarus.projects.document import all_objects

# The world component each stage setting changes; episode_seconds changes the task itself.
SETTING_KINDS: dict[CurriculumParameter, str | None] = {
    "episode_seconds": None,
    "goal_distance": "spawn_point",
    "heading_range": "spawn_point",
    "align_within": "goal_zone",
    "stop_speed": "goal_zone",
}


def stage_count(task: TaskSpec) -> int:
    """How many stages a task practices; a task without a curriculum has one, the task as it is."""
    return max(1, len(task.curriculum))


def stage_project(project: Project, stage: int) -> Project:
    """The project as the brain practices it at a stage: the stage's settings over the task and its world, with no
    curriculum left, so it is a one-stage project."""
    curriculum = project.task.curriculum
    if not curriculum:
        return project
    staged = project.model_copy(deep=True)
    staged.task.curriculum = []
    for setting in curriculum[min(max(stage, 0), len(curriculum) - 1)].settings:
        _apply(staged, setting)
    return staged


def _apply(project: Project, setting: StageSetting) -> None:
    kind = SETTING_KINDS[setting.parameter]
    if kind is None:
        project.task.episode_seconds = setting.value
        return
    for obj in all_objects(project):
        for component in obj.components:
            if component.kind == kind:
                component.properties[setting.parameter] = NumberValue(type="number", value=setting.value)


def curriculum_issues(project: Project) -> list[ValidationIssue]:
    """Stages with repeated names or settings, settings outside their range, or for a part the world lacks."""
    issues: list[ValidationIssue] = []
    kinds = {component.kind for obj in all_objects(project) for component in obj.components}
    names: set[str] = set()
    for index, stage in enumerate(project.task.curriculum):
        path = f"task.curriculum.{index}"
        if stage.name in names:
            issues.append(ValidationIssue(path=path, message=f"Two stages are called {stage.name!r}"))
        names.add(stage.name)
        seen: set[CurriculumParameter] = set()
        for setting in stage.settings:
            where = f"{path}.{setting.parameter}"
            if setting.parameter in seen:
                issues.append(ValidationIssue(path=where, message=f"{stage.name} sets {setting.parameter} twice"))
            seen.add(setting.parameter)
            problem = _setting_problem(setting, kinds)
            if problem:
                issues.append(ValidationIssue(path=where, message=f"{stage.name}: {problem}"))
    return issues


def _setting_problem(setting: StageSetting, kinds: set[str]) -> str | None:
    kind = SETTING_KINDS[setting.parameter]
    if kind is None:
        if MIN_EPISODE_SECONDS <= setting.value <= MAX_EPISODE_SECONDS:
            return None
        return f"a try lasts between {MIN_EPISODE_SECONDS:g} and {MAX_EPISODE_SECONDS:g} s"
    spec = COMPONENTS[kind]
    if kind not in kinds:
        return f"{setting.parameter} needs a {spec.label.lower()}"
    schema = next(item for item in spec.properties if item.id == setting.parameter)
    return check_value(schema, NumberValue(type="number", value=setting.value))
