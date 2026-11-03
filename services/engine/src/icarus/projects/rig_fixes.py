"""A body's rig check run now (the design tests and the rig audit) and its fixes applied as one revision."""

from icarus.contracts.operations import EditOperation, OperationBatch
from icarus.contracts.project import ProjectState
from icarus.contracts.rig import RigCheck, RigFinding, RigFixResult
from icarus.design.checks import design_report
from icarus.design.rig_audit import Finding, rig_findings
from icarus.design.test_poses import pose_options
from icarus.projects.store import ProjectStore, RejectedBatch


def _findings(state: ProjectState) -> list[Finding]:
    report, compiled = design_report(state.project)
    return rig_findings(state.project, compiled) if compiled is not None else []


def rig_check(state: ProjectState) -> RigCheck:
    """The design tests of the current revision run again, the audit's findings and the poses the body can take."""
    report, compiled = design_report(state.project)
    findings = rig_findings(state.project, compiled) if compiled is not None else []
    return RigCheck(
        report=report,
        findings=[RigFinding(id=item.id, part=item.part, text=item.text, fixable=bool(item.fix)) for item in findings],
        poses=pose_options(state.project.task.motion is not None) if state.project.bodies else [],
    )


def fix_rig(store: ProjectStore, project_id: str) -> RigFixResult:
    """Apply every fix the audit has in one batch; a fix the design tests refuse is left out and the rest still land."""
    state = store.state(project_id)
    findings = [item for item in _findings(state) if item.fix]
    applied: list[str] = []
    revision: int | None = None
    if findings:
        operations: list[EditOperation] = [operation for item in findings for operation in item.fix]
        summary = f"Fixed {len(findings)} {'problem' if len(findings) == 1 else 'problems'} in the body"
        try:
            state = store.apply(project_id, OperationBatch(operations=operations, summary=summary))
            applied = [item.text for item in findings]
        except RejectedBatch:
            for item in findings:
                try:
                    batch = OperationBatch(operations=item.fix, summary=f"Fixed {item.text}"[:200])
                    state = store.apply(project_id, batch)
                    applied.append(item.text)
                except RejectedBatch:
                    continue
        revision = state.revision.number if applied else None
    return RigFixResult(applied=applied, revision=revision, check=rig_check(state))
