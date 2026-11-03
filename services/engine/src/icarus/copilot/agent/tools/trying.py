from pydantic import Field

from icarus.contracts.operations import (
    AddBody,
    CreateObject,
    EditOperation,
    RemoveBody,
    RemoveRewardTerm,
    SetRewardTerm,
    SetTaskFamily,
)
from icarus.contracts.project import Project
from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TryResult, TurnScope
from icarus.copilot.agent.tools.inspect import compact
from icarus.copilot.agent.tools.look import LookArgs, View, look
from icarus.copilot.language import Language, implies_destination
from icarus.copilot.proposal_changes import proposal_changes
from icarus.copilot.scratch_stages import placement_problem, trainability_problem
from icarus.copilot.step_words import step_said
from icarus.design.checks import design_report
from icarus.design.compiler import CompiledModel, compile_project
from icarus.design.course import POSTURE_TERMS, course_report, legged, posture_warning
from icarus.library.rewards import CORE_TERMS, term_fits
from icarus.projects.operations import OperationError, apply_operations

PLACEMENT = "placement of "
# The OperationBatch limit, so any change that passes a try can be applied as one revision.
MAX_OPERATIONS = 500
CHANGES_LISTED = 40
_TASK_OPS = (AddBody, RemoveBody, SetTaskFamily, SetRewardTerm, RemoveRewardTerm)


class LookSpec(ToolArgs):
    target: str | None = Field(default=None, description="Object, body or zone to frame; none for the whole scene.")
    view: View = Field(default="three_quarter")
    distance_m: float | None = Field(default=None, ge=0.3, le=60)


class TryArgs(ToolArgs):
    operations: list[EditOperation] = Field(min_length=1, max_length=MAX_OPERATIONS)
    look: LookSpec | None = Field(default=None, description="Also render the candidate from this camera.")
    base_try: str | None = Field(
        default=None, description="A passing try id: its operations come first, so this try builds on it."
    )


def base_of(scope: TurnScope, base_try: str | None) -> tuple[list[EditOperation], Project, CompiledModel | None] | str:
    """The operations, document and compiled model a try builds on: a passing try's, or the project's own."""
    if base_try is None:
        return [], scope.state.project, scope.head_compiled
    tried = scope.tries.get(base_try)
    if tried is None:
        return f"There is no try `{base_try}` in this turn (tries: {', '.join(scope.tries) or 'none yet'})."
    if not tried.passed:
        return f"Try {base_try} did not pass, so nothing can build on it: {'; '.join(tried.problems)}"
    return list(tried.operations), apply_operations(scope.state.project, tried.operations), tried.compiled


def too_many(count: int) -> str | None:
    if count <= MAX_OPERATIONS:
        return None
    return f"That is {count} operations with the base try; one change holds at most {MAX_OPERATIONS}."


def _body_ids(project: Project) -> dict[str, str]:
    """The body each body part belongs to."""
    return {obj.id: body.id for body in project.bodies for obj in body.objects}


def touches_body_or_task(project: Project, operations: list[EditOperation]) -> bool:
    parts = _body_ids(project)
    for op in operations:
        if isinstance(op, _TASK_OPS) or (isinstance(op, CreateObject) and op.target != "world"):
            return True
        target = getattr(op, "object", None)
        if isinstance(target, str) and target in parts:
            return True
    return False


def _checks(scope: TurnScope, candidate: Project, operations: list[EditOperation]) -> tuple[list[dict], list[str]]:
    checks: list[dict] = []
    for body in candidate.bodies:
        problem = placement_problem(candidate, body.id)
        before = scope.state.project
        # A problem the project already had is not this change's fault, so it does not fail the try.
        if (
            problem
            and any(item.id == body.id for item in before.bodies)
            and placement_problem(before, body.id) == problem
        ):
            problem = None
        checks.append({"check": f"{PLACEMENT}{body.name}", "ok": problem is None, "detail": problem})
    if candidate.task.family != "none" and touches_body_or_task(scope.state.project, operations):
        problem = trainability_problem(candidate)
        checks.append({"check": "trainable", "ok": problem is None, "detail": problem})
    return checks, [f"{check['check']}: {check['detail']}" for check in checks if not check["ok"]]


DESTINATION_WARNING = (
    "The person's goal has a destination: add a goal zone at the finish and use the navigation task with "
    "progress_to_goal and reach_goal"
)


def _design_warnings(scope: TurnScope, project: Project, compiled: CompiledModel) -> tuple[list[str], list[str]]:
    """Problems a design has on its way (a way around obstacles, rays that miss them, a legged body that may stop
    caring about falling), and the obstacle ids its rays see from the spawn."""
    course = course_report(project, compiled)
    warnings = list(course.warnings)
    if posture := posture_warning(scope.state.project, project):
        warnings.append(posture)
    return warnings, course.seen


def _lacks_destination(scope: TurnScope, project: Project) -> bool:
    """A request with a place to get to, for a design without a finish to reach."""
    has_goal = any(component.kind == "goal_zone" for obj in project.world.objects for component in obj.components)
    return (
        bool(project.bodies)
        and implies_destination(scope.request)
        and (not has_goal or project.task.family != "navigation")
    )


def _check_name(check: str, language: Language) -> str:
    if check.startswith(PLACEMENT):
        return step_said("check_placement", language, name=check.removeprefix(PLACEMENT))
    return step_said(f"check_{check}", language)


def _words(items: list[str]) -> str:
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} and {items[-1]}"


def reward_fix(project: Project) -> dict | None:
    """Which reward terms a task must drop and add to fit its family, said so one try can fix it; None when they fit."""
    family = project.task.family
    has = {term.term for term in project.task.rewards}
    remove = sorted(term for term in has if not term_fits(term, family))
    if not remove:
        return None
    wanted = [*CORE_TERMS[family], *(POSTURE_TERMS if legged(project) and family != "none" else ())]
    add = [term for term in wanted if term not in has]
    keep = sorted(has - set(remove))
    how = f"The {family} task cannot use {_words(remove)}: in the same try, remove_reward_term {_words(remove)}"
    how += f" and set_reward_term {_words(add)}" if add else ""
    how += f"; keep {_words(keep)}" if keep else ""
    return {"remove": remove, "add": add, "keep": keep, "how": how}


def try_change(scope: TurnScope, args: TryArgs) -> Observation:
    base = base_of(scope, args.base_try)
    if isinstance(base, str):
        return Observation(base, ok=False, summary=step_said("try_no_base", scope.language))
    operations = [*base[0], *args.operations]
    if problem := too_many(len(operations)):
        return Observation(problem, ok=False, summary=step_said("try_no_base", scope.language))
    return run_try(scope, operations, args.look)


def run_try(scope: TurnScope, operations: list[EditOperation], look_spec: LookSpec | None) -> Observation:
    """Validate, compile and check operations on a copy of the project, keeping the result as a new try."""
    try_id = scope.next_try_id()
    project, count, language = scope.state.project, len(operations), scope.language
    changes = step_said("changes_one" if count == 1 else "changes_many", language, count=count)
    try:
        candidate = apply_operations(project, operations)
    except OperationError as error:
        scope.tries[try_id] = TryResult(try_id, operations, scope.state.revision.number, [str(error)], None)
        result = {
            "try_id": try_id,
            "passed": False,
            "checks": [{"check": "operations", "ok": False, "detail": str(error)}],
        }
        return Observation(compact(result), ok=False, summary=step_said("tried_invalid", language, changes=changes))
    report, compiled = design_report(candidate)
    checks = [
        {"check": check.label, "ok": check.status != "fail", "detail": check.detail if check.status == "fail" else None}
        for check in report.checks
    ]
    names = [step_said(f"check_{check.id}", language) for check in report.checks]
    problems = [f"{check.label}: {check.detail}" for check in report.checks if check.status == "fail"]
    if compiled is not None and not problems:
        more, problems = _checks(scope, candidate, operations)
        checks += more
        names += [_check_name(check["check"], language) for check in more]
    if compiled is None and not problems:
        problems = ["the design does not compile"]
    warnings: list[str] = []
    result_extra: dict = {}
    if compiled is not None and not problems:
        found, seen = _design_warnings(scope, candidate, compiled)
        head = scope.head_compiled = scope.head_compiled or compile_project(project)
        before = set(_design_warnings(scope, project, head)[0])
        warnings = [text for text in found if text not in before]
        # The request is this turn's, so a missing finish is said on every try until the design has one.
        warnings += [DESTINATION_WARNING] if _lacks_destination(scope, candidate) else []
        result_extra = {"warnings": warnings, "warnings_already_there": [text for text in found if text in before]}
        result_extra["rays_see"] = seen
    base = scope.state.revision.number
    scope.tries[try_id] = TryResult(try_id, operations, base, problems, compiled, tuple(warnings))
    listed = [change.model_dump(exclude_none=True) for change in proposal_changes(project, operations)]
    result = {"try_id": try_id, "passed": not problems, "changes": listed[:CHANGES_LISTED], "checks": checks}
    if len(listed) > CHANGES_LISTED:
        result["more_changes"] = len(listed) - CHANGES_LISTED
    result |= result_extra
    if problems and (fix := reward_fix(candidate)):
        result["fix_rewards"] = fix
    failed = next((name for check, name in zip(checks, names, strict=True) if not check["ok"]), None)
    summary = (
        step_said("tried_failed", language, changes=changes, check=failed)
        if failed
        else step_said("tried_passed", language, changes=changes)
    )
    if warnings:
        summary += step_said("warnings_one" if len(warnings) == 1 else "warnings_many", language, count=len(warnings))
    observation = Observation(compact(result), ok=not problems, summary=summary)
    if problems or look_spec is None:
        return observation
    seen = look(
        scope, LookArgs(target=look_spec.target, view=look_spec.view, distance_m=look_spec.distance_m, on_try=try_id)
    )
    return Observation(
        f"{observation.text}\n{seen.text}", image=seen.image, image_label=seen.image_label, summary=summary
    )


TRY = Tool(
    name="try",
    description=(
        "Try edit operations on a copy of the project, never on the project itself: it validates them, compiles, "
        "runs the design tests, checks that every body starts resting on the ground clear of everything, and "
        "that the task can still be learned when a body or the task changes. Returns a try_id, what changes and "
        "each check. Every change must pass a try before propose or apply. Add look to see the candidate. "
        "base_try builds on an earlier passing try (such as one from pattern or edit_group), so the new try holds "
        f"both; up to {MAX_OPERATIONS} operations in all."
    ),
    args=TryArgs,
    step="try",
    effect="read",
    run=try_change,
    per_turn=6,
    timeout_s=40,
    observation_chars=8_000,
)
