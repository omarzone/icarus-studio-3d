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
from icarus.copilot.proposal_changes import proposal_changes
from icarus.copilot.scratch_stages import placement_problem, trainability_problem
from icarus.design.checks import design_report
from icarus.projects.operations import OperationError, apply_operations

_TASK_OPS = (AddBody, RemoveBody, SetTaskFamily, SetRewardTerm, RemoveRewardTerm)


class LookSpec(ToolArgs):
    target: str | None = Field(default=None, description="Object, body or zone to frame; none for the whole scene.")
    view: View = Field(default="three_quarter")
    distance_m: float | None = Field(default=None, ge=0.3, le=60)


class TryArgs(ToolArgs):
    operations: list[EditOperation] = Field(min_length=1, max_length=50)
    look: LookSpec | None = Field(default=None, description="Also render the candidate from this camera.")


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
        checks.append({"check": f"placement of {body.name}", "ok": problem is None, "detail": problem})
    if candidate.task.family != "none" and touches_body_or_task(scope.state.project, operations):
        problem = trainability_problem(candidate)
        checks.append({"check": "trainable", "ok": problem is None, "detail": problem})
    return checks, [f"{check['check']}: {check['detail']}" for check in checks if not check["ok"]]


def try_change(scope: TurnScope, args: TryArgs) -> Observation:
    try_id = scope.next_try_id()
    project, count = scope.state.project, len(args.operations)
    noun = "change" if count == 1 else "changes"
    try:
        candidate = apply_operations(project, args.operations)
    except OperationError as error:
        scope.tries[try_id] = TryResult(try_id, args.operations, scope.state.revision.number, [str(error)], None)
        result = {
            "try_id": try_id,
            "passed": False,
            "checks": [{"check": "operations", "ok": False, "detail": str(error)}],
        }
        return Observation(compact(result), ok=False, summary=f"Tried {count} {noun}: not valid")
    report, compiled = design_report(candidate)
    checks = [
        {"check": check.label, "ok": check.status != "fail", "detail": check.detail if check.status == "fail" else None}
        for check in report.checks
    ]
    problems = [f"{check.label}: {check.detail}" for check in report.checks if check.status == "fail"]
    if compiled is not None and not problems:
        more, problems = _checks(scope, candidate, args.operations)
        checks += more
    if compiled is None and not problems:
        problems = ["the design does not compile"]
    scope.tries[try_id] = TryResult(try_id, args.operations, scope.state.revision.number, problems, compiled)
    changes = [change.model_dump(exclude_none=True) for change in proposal_changes(project, args.operations)]
    result = {"try_id": try_id, "passed": not problems, "changes": changes, "checks": checks}
    failed = next((check["check"] for check in checks if not check["ok"]), None)
    summary = f"Tried {count} {noun}: {failed} check failed" if failed else f"Tried {count} {noun}: all checks passed"
    observation = Observation(compact(result), ok=not problems, summary=summary)
    if problems or args.look is None:
        return observation
    seen = look(
        scope, LookArgs(target=args.look.target, view=args.look.view, distance_m=args.look.distance_m, on_try=try_id)
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
        "each check. Every change must pass a try before propose or apply. Add look to see the candidate."
    ),
    args=TryArgs,
    step="try",
    effect="read",
    run=try_change,
    per_turn=6,
    timeout_s=40,
    observation_chars=8_000,
)
