import json
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.copilot import Autonomy, Conversation, CopilotMessage, CopilotProposal, SendMessage
from icarus.contracts.operations import EditOperation, OperationBatch
from icarus.contracts.project import Project
from icarus.contracts.scene import SceneDescription
from icarus.copilot.client import copilot_client
from icarus.copilot.context import project_context
from icarus.copilot.conversation_store import ConversationStore
from icarus.copilot.grounding import UNSUPPORTED_ANSWER, unsupported_numbers
from icarus.copilot.proposal_changes import proposal_changes
from icarus.copilot.settings import ModelSettingsStore
from icarus.design.checks import design_report
from icarus.design.compiler import CompiledModel
from icarus.design.scene import scene_description
from icarus.projects.operations import OperationError, apply_operations
from icarus.projects.store import PROJECT_ID, ProjectStore
from icarus.training.run_store import RunStore

HISTORY_MESSAGES = 12

SYSTEM = """You are the copilot of Icarus Studio 3D, inside one project: a world, bodies, a task and a brain trained
with reinforcement learning on MuJoCo. Answer the person briefly and concretely. When they ask for a change, propose
it as edit operations on objects, components and properties that exist in the project, using only library component
kinds and values inside their ranges. When they ask what something does, explain it from the library schema and its
current values. Only cite numbers that appear in the context below or in their message. Suggest up to three short
follow-up questions.
Conversation so far:
{history}
Project context (JSON):
{context}"""


class _Output(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProposalDraft(_Output):
    summary: str = Field(min_length=1, max_length=200)
    explanation: str = Field(min_length=1, max_length=2000)
    operations: list[EditOperation] = Field(min_length=1, max_length=50)


class ChatReply(_Output):
    answer: str = Field(min_length=1, max_length=4000)
    proposal: ProposalDraft | None
    suggestions: list[str] = Field(max_length=3)


class UnknownProposal(LookupError):
    pass


class ProposalOutdated(Exception):
    pass


class ProposalClosed(Exception):
    pass


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


@dataclass
class _Review:
    """What the last check of a reply found, so the final answer knows which parts to drop."""

    project: Project
    sources: list[str]
    # Run results and the person's words: the only sources that back a percentage.
    percent_sources: list[str]
    unsupported: list[str] = field(default_factory=list)
    proposal_unsupported: list[str] = field(default_factory=list)
    proposal_problem: str | None = None
    dropped_suggestions: list[str] = field(default_factory=list)

    def _unbacked(self, text: str, sources: list[str]) -> list[str]:
        return unsupported_numbers(text, sources, self.percent_sources)

    def check(self, reply: ChatReply) -> list[str]:
        self.proposal_problem, self.proposal_unsupported = None, []
        sources = list(self.sources)
        if reply.proposal is not None:
            result = dry_run(self.project, reply.proposal.operations)
            if isinstance(result, str):
                self.proposal_problem = result
            else:
                # Values the copilot proposes in a validated change are backed by that change.
                sources.append(json.dumps([op.model_dump() for op in reply.proposal.operations]))
            described = f"{reply.proposal.summary}\n{reply.proposal.explanation}"
            self.proposal_unsupported = self._unbacked(described, sources)
        self.unsupported = self._unbacked(reply.answer, sources)
        self.dropped_suggestions = [text for text in reply.suggestions if self._unbacked(text, sources)]
        problems = [f"The proposal is not valid: {self.proposal_problem}"] if self.proposal_problem else []
        unbacked = [*self.unsupported, *self.proposal_unsupported]
        unbacked += [number for text in self.dropped_suggestions for number in self._unbacked(text, sources)]
        if unbacked:
            problems.append(f"These numbers are not in the context or the conversation: {', '.join(unbacked)}")
        return problems


def _message(role: str, text: str, **fields: object) -> CopilotMessage:
    return CopilotMessage.model_validate(
        {"id": secrets.token_hex(6), "role": role, "text": text, "created_at": datetime.now(UTC), **fields}
    )


def _project_of(proposal_id: str) -> str:
    project_id, _, token = proposal_id.partition("-")
    if not PROJECT_ID.fullmatch(project_id) or not token:
        raise UnknownProposal(proposal_id)
    return project_id


def _history(conversation: Conversation) -> str:
    recent = conversation.messages[-HISTORY_MESSAGES:]
    return "\n".join(f"{message.role}: {message.text}" for message in recent) or "(none)"


class Copilot:
    """The chat role: answers, proposals validated by a dry run, and applying them through the project store."""

    def __init__(
        self, projects: ProjectStore, runs: RunStore, conversations: ConversationStore, settings: ModelSettingsStore
    ) -> None:
        self._projects = projects
        self._runs = runs
        self._conversations = conversations
        self._settings = settings

    def conversation(self, project_id: str) -> Conversation:
        head = self._projects.state(project_id).revision.number
        with self._conversations.editing(project_id) as conversation:
            for proposal in conversation.proposals:
                if proposal.status == "open" and proposal.base_revision != head:
                    proposal.status = "outdated"
            return conversation.model_copy(deep=True)

    def set_autonomy(self, project_id: str, autonomy: Autonomy) -> Conversation:
        self._projects.state(project_id)
        with self._conversations.editing(project_id) as conversation:
            conversation.autonomy = autonomy
        return self.conversation(project_id)

    def send(self, project_id: str, message: SendMessage) -> Conversation:
        state = self._projects.state(project_id)
        client = copilot_client(self._settings)
        context = project_context(state, self._runs, message.selection, message.workspace)
        history = _history(self.conversation(project_id))
        system = SYSTEM.format(history=history, context=context)
        run_facts = json.dumps(json.loads(context)["latest_run"])
        review = _Review(state.project, [context, message.text, history], [run_facts, message.text, history])
        reply = client.ask("chat_reply", ChatReply, system, message.text, review.check)
        answer, draft = reply.value.answer, reply.value.proposal
        if review.proposal_problem:
            answer = f"{answer} I could not turn this into a change that passes validation: {review.proposal_problem}"
            draft = None
        elif review.proposal_unsupported:
            answer = f"{answer} I left out the change I had in mind: its description cites numbers I could not back."
            draft = None
        if review.unsupported:
            answer = UNSUPPORTED_ANSWER
        suggestions = [text for text in reply.value.suggestions if text not in review.dropped_suggestions]
        proposal = self._proposal(state.project, state.revision.number, draft) if draft else None
        with self._conversations.editing(project_id) as conversation:
            conversation.messages.append(_message("user", message.text))
            proposal_id = proposal.id if proposal else None
            conversation.messages.append(_message("copilot", answer, thinking=reply.thinking, proposal_id=proposal_id))
            if proposal:
                conversation.proposals.append(proposal)
            conversation.suggestions = suggestions
            autopilot = conversation.autonomy == "autopilot"
        if proposal and autopilot:
            try:
                return self.apply(proposal.id)
            except ProposalOutdated:
                # The project moved on while the model answered; the proposal stays visible as outdated.
                pass
        return self.conversation(project_id)

    def _proposal(self, project: Project, base: int, draft: ProposalDraft) -> CopilotProposal:
        warnings: list[str] = []
        if self._runs.list_runs(project.id):
            warnings.append("Earlier runs keep their results; train again to see the effect of this change.")
        return CopilotProposal(
            id=f"{project.id}-{secrets.token_hex(4)}",
            project_id=project.id,
            base_revision=base,
            summary=draft.summary,
            explanation=draft.explanation,
            operations=draft.operations,
            changes=proposal_changes(project, draft.operations),
            warnings=warnings,
            status="open",
        )

    def _open(self, conversation: Conversation, proposal_id: str) -> CopilotProposal:
        proposal = next((item for item in conversation.proposals if item.id == proposal_id), None)
        if proposal is None:
            raise UnknownProposal(proposal_id)
        if proposal.status == "outdated":
            raise ProposalOutdated(proposal_id)
        if proposal.status != "open":
            raise ProposalClosed(proposal.status)
        return proposal

    def apply(self, proposal_id: str) -> Conversation:
        project_id = _project_of(proposal_id)
        self.conversation(project_id)
        with self._conversations.editing(project_id) as conversation:
            proposal = self._open(conversation, proposal_id)
            outdated = proposal.base_revision != self._projects.state(project_id).revision.number
            if outdated:
                proposal.status = "outdated"
            else:
                batch = OperationBatch(operations=proposal.operations, author="copilot", summary=proposal.summary)
                state = self._projects.apply(project_id, batch)
                proposal.status = "applied"
                proposal.applied_revision = state.revision.number
        if outdated:
            raise ProposalOutdated(proposal_id)
        return self.conversation(project_id)

    def discard(self, proposal_id: str) -> Conversation:
        project_id = _project_of(proposal_id)
        self.conversation(project_id)
        with self._conversations.editing(project_id) as conversation:
            self._open(conversation, proposal_id).status = "discarded"
        return self.conversation(project_id)

    def proposal_scene(self, proposal_id: str) -> SceneDescription:
        project_id = _project_of(proposal_id)
        proposal = self._open(self.conversation(project_id), proposal_id)
        state = self._projects.state(project_id)
        compiled = dry_run(state.project, proposal.operations)
        if isinstance(compiled, str):
            raise ProposalOutdated(proposal_id)
        return scene_description(compiled, state.revision.number)
