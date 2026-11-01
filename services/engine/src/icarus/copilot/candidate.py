import secrets

from icarus.contracts.copilot import CopilotProposal
from icarus.contracts.operations import EditOperation
from icarus.contracts.project import Project
from icarus.copilot.proposal_changes import proposal_changes
from icarus.design.checks import design_report
from icarus.design.compiler import CompiledModel
from icarus.projects.operations import OperationError, apply_operations

RUNS_KEEP_RESULTS = "Earlier runs keep their results; train again to see the effect of this change."


def dry_run(project: Project, operations: list[EditOperation]) -> CompiledModel | str:
    """The compiled project with the operations applied to a copy, or why they do not pass validation."""
    try:
        candidate = apply_operations(project, operations)
    except OperationError as error:
        return str(error)
    report, compiled = design_report(candidate)
    if not report.ok or compiled is None:
        return "; ".join(check.detail for check in report.checks if check.status == "fail")
    return compiled


def new_proposal(
    project: Project,
    base: int,
    summary: str,
    explanation: str,
    operations: list[EditOperation],
    warnings: list[str],
    has_runs: bool,
) -> CopilotProposal:
    """An open proposal against the revision its operations were checked on."""
    return CopilotProposal(
        id=f"{project.id}-{secrets.token_hex(4)}",
        project_id=project.id,
        base_revision=base,
        summary=summary,
        explanation=explanation,
        operations=operations,
        changes=proposal_changes(project, operations),
        warnings=[*warnings, RUNS_KEEP_RESULTS] if has_runs else list(warnings),
        status="open",
    )
