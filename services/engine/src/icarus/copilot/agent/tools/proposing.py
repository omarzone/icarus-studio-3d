import json

from pydantic import Field

from icarus.contracts.operations import OperationBatch
from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TryResult, TurnScope
from icarus.copilot.candidate import dry_run, new_proposal
from icarus.copilot.grounding import unsupported_numbers
from icarus.copilot.language import say
from icarus.projects.operations import OperationError
from icarus.projects.store import RejectedBatch


class ProposeArgs(ToolArgs):
    try_id: str = Field(description="The id of a try that passed every check.")
    summary: str = Field(min_length=1, max_length=200, description="A short title for the change.")
    explanation: str = Field(min_length=1, max_length=2000, description="What changes and why, in plain words.")
    warnings: list[str] = Field(default=[], max_length=3, description="Problems you see in your own change.")


class ApplyArgs(ToolArgs):
    try_id: str = Field(description="The id of a try that passed every check.")
    summary: str = Field(min_length=1, max_length=200, description="A short title for the change.")


def _passed(scope: TurnScope, try_id: str) -> TryResult | str:
    tried = scope.tries.get(try_id)
    if tried is None:
        known = ", ".join(scope.tries) or "none yet"
        return f"There is no try `{try_id}` in this turn (tries: {known}). Try the change first."
    if not tried.passed:
        return f"Try {try_id} did not pass: {'; '.join(tried.problems)}. Fix it and try again."
    return tried


def _unbacked(scope: TurnScope, tried: TryResult, texts: list[str]) -> list[str]:
    # Values inside a change that passed its checks are backed by that change.
    sources = [*scope.sources, json.dumps([op.model_dump() for op in tried.operations])]
    return [number for text in texts for number in unsupported_numbers(text, sources, scope.percent_sources)]


def propose(scope: TurnScope, args: ProposeArgs) -> Observation:
    tried = _passed(scope, args.try_id)
    if isinstance(tried, str):
        return Observation(tried, ok=False, summary="Could not propose a change that has not passed a try")
    if tried.base_revision != scope.state.revision.number:
        return Observation(
            "The project changed since that try; try the change again.",
            ok=False,
            summary="Could not propose: the project changed",
        )
    unbacked = _unbacked(scope, tried, [args.summary, args.explanation, *args.warnings])
    if unbacked:
        text = f"These numbers are not in the project, the tool results or the conversation: {', '.join(unbacked)}"
        return Observation(text, ok=False, summary="Could not propose: its description cites unbacked numbers")
    has_runs = bool(scope.services.runs.list_runs(scope.project_id))
    warnings = [*args.warnings, *(text for text in tried.warnings if text not in args.warnings)]
    proposal = new_proposal(
        scope.state.project,
        tried.base_revision,
        args.summary,
        args.explanation,
        tried.operations,
        warnings,
        has_runs,
    )
    scope.proposal, scope.proposal_try = proposal, args.try_id
    if scope.autonomy == "autopilot":
        text = "Proposal ready. In autopilot apply it with apply and the same try_id; the engine applies it otherwise."
    else:
        text = "Proposal ready; the person sees it with Apply and Discard buttons and decides."
    return Observation(text, summary=f"Proposed “{args.summary}”"[:200])


def apply(scope: TurnScope, args: ApplyArgs) -> Observation:
    tried = _passed(scope, args.try_id)
    if isinstance(tried, str):
        return Observation(tried, ok=False, summary="Could not apply a change that has not passed a try")
    services = scope.services
    head = services.projects.state(scope.project_id)
    if head.revision.number != tried.base_revision and isinstance(dry_run(head.project, tried.operations), str):
        return Observation(
            "The project changed since the try; try again.", ok=False, summary="Could not apply: the project changed"
        )
    unbacked = _unbacked(scope, tried, [args.summary])
    if unbacked:
        return Observation(
            f"The summary cites unbacked numbers: {', '.join(unbacked)}", ok=False, summary="Could not apply"
        )
    proposal = new_proposal(head.project, head.revision.number, args.summary, args.summary, tried.operations, [], False)
    try:
        state = services.projects.apply(
            scope.project_id, OperationBatch(operations=tried.operations, author="copilot", summary=args.summary)
        )
    except (RejectedBatch, OperationError) as error:
        return Observation(f"The project refused the change: {error}", ok=False, summary="Could not apply the change")
    proposal.status, proposal.applied_revision = "applied", state.revision.number
    scope.applied.append(proposal)
    scope.state, scope.head_compiled, scope.proposal, scope.proposal_try = state, None, None, None
    revision = state.revision.number
    scope.side_effects.append(say("applied", scope.language, summary=args.summary, revision=revision))
    return Observation(
        f"Applied as revision {revision}.", summary=f"Applied “{args.summary}” as revision {revision}"[:200]
    )


PROPOSE = Tool(
    name="propose",
    description=(
        "Turn a try that passed into a proposal the person sees with Apply and Discard buttons. One proposal per "
        "message: a later propose replaces the earlier one."
    ),
    args=ProposeArgs,
    step="propose",
    effect="write",
    run=propose,
    per_turn=3,
    timeout_s=10,
)

APPLY = Tool(
    name="apply",
    description="Autopilot only: apply a try that passed to the project as a new revision authored by the copilot.",
    args=ApplyArgs,
    step="propose",
    effect="write",
    run=apply,
    per_turn=2,
    timeout_s=20,
)
