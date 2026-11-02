import contextlib
import json
import threading
from collections.abc import Callable
from dataclasses import dataclass, replace
from typing import Any

from icarus.contracts.copilot import (
    Autonomy,
    Capability,
    ChatAction,
    Conversation,
    CopilotMessage,
    CopilotProposal,
    SendMessage,
)
from icarus.contracts.events import EngineEvent, MessagePostedEvent, ProposalAppliedEvent
from icarus.contracts.operations import OperationBatch
from icarus.contracts.project import Project
from icarus.contracts.scene import SceneDescription
from icarus.copilot.agent.budget import AgentLimits
from icarus.copilot.agent.harness import SUBAGENT_NOTE, chat_tools, worker_tools
from icarus.copilot.agent.loop import run_loop
from icarus.copilot.agent.prompt import system_prompt
from icarus.copilot.agent.summary_store import SummaryStore
from icarus.copilot.agent.tools.base import Tool, ToolServices, TurnScope
from icarus.copilot.agent.tools.coaching import Coaching
from icarus.copilot.agent.turn import TurnSetup, new_message, run_turn
from icarus.copilot.attachments import AttachmentStore
from icarus.copilot.candidate import dry_run, new_proposal
from icarus.copilot.chat_training import ChatTrainer
from icarus.copilot.client import InputRejected, ModelClient, ToolsRefused, capability_client, copilot_client
from icarus.copilot.context import lean_context, project_context
from icarus.copilot.conversation_store import ConversationStore
from icarus.copilot.grounding import UNSUPPORTED_ANSWER
from icarus.copilot.hooks import HookRegistry
from icarus.copilot.language import Language, detect
from icarus.copilot.settings import ModelSettingsStore
from icarus.copilot.single_shot import AUTOPILOT, SYSTEM, ChatReply, ProposalDraft, Review, history_text
from icarus.copilot.skill_tool import skill_catalog_text
from icarus.copilot.subagents import SubagentJob, SubagentOutcome, Subagents
from icarus.copilot.turn_media import TurnMedia, turn_media
from icarus.copilot.welcome import welcome_message
from icarus.design.scene import scene_description
from icarus.projects.store import PROJECT_ID, ProjectStore
from icarus.sim.views import ViewRenderer
from icarus.training.run_store import RunStore

__all__ = ["ChatReply", "Copilot", "CopilotBusy", "ProposalClosed", "ProposalOutdated", "UnknownProposal", "dry_run"]

CANNOT_SEE = (
    "I can't read pictures with the current model connection. Set a Vision model in Settings › AI models, "
    "or tell me in words what you need."
)
BUSY = "The copilot is still answering the previous message."


class UnknownProposal(LookupError):
    pass


class ProposalOutdated(Exception):
    pass


class ProposalClosed(Exception):
    pass


class CopilotBusy(Exception):
    """A message arrived while the copilot was still answering another one in the same project."""


def _project_of(proposal_id: str) -> str:
    project_id, _, token = proposal_id.partition("-")
    if not PROJECT_ID.fullmatch(project_id) or not token:
        raise UnknownProposal(proposal_id)
    return project_id


def _retire_open(conversation: Conversation) -> None:
    """A new proposal replaces the one still open from an earlier message; only the newest can be applied."""
    for proposal in conversation.proposals:
        if proposal.status == "open":
            proposal.status = "outdated"


@dataclass(frozen=True)
class Harness:
    """What the engine app hands the chat: where events go, its hook points, project memory and the subagent hub."""

    publish: Callable[[EngineEvent, str | None], None] | None = None
    hooks: HookRegistry | None = None
    memory: Callable[[TurnScope, str], str] | None = None
    subagents: Subagents | None = None
    # A new project's empty conversation opens with a copilot message and starter suggestions.
    welcome: bool = False


class Copilot:
    """The chat role: an agent turn per message, proposals validated by a try, applied through the project store."""

    def __init__(
        self,
        projects: ProjectStore,
        runs: RunStore,
        conversations: ConversationStore,
        settings: ModelSettingsStore,
        trainer: ChatTrainer,
        attachments: AttachmentStore,
        views: ViewRenderer | None = None,
        limits: AgentLimits | None = None,
    ) -> None:
        self._projects = projects
        self._runs = runs
        self._conversations = conversations
        self._settings = settings
        self._trainer = trainer
        self._attachments = attachments
        self._services = ToolServices(projects, runs, trainer, attachments, views or ViewRenderer())
        self._summaries = SummaryStore(conversations.folder)
        self._limits = limits or AgentLimits()
        self._busy: dict[str, threading.Lock] = {}
        self._guard = threading.Lock()
        self._harness = Harness()
        self._tools: dict[str, Tool[Any]] | None = None

    @property
    def services(self) -> ToolServices:
        return self._services

    @property
    def settings(self) -> ModelSettingsStore:
        return self._settings

    @property
    def limits(self) -> AgentLimits:
        return self._limits

    def attach_coaching(self, coaching: Coaching) -> None:
        """Hands the chat's tools the coach and the autopilot, which are built after the copilot they post through."""
        self._services = replace(self._services, coaching=coaching)

    def attach_harness(self, harness: Harness) -> None:
        """Turns on the harness extensions: their tools, the skill catalog, memory, hooks and live events."""
        self._harness = harness
        self._tools = chat_tools(harness.subagents)

    def _publish(self, event: EngineEvent, project_id: str) -> None:
        if self._harness.publish is not None:
            self._harness.publish(event, project_id)

    def post(self, project_id: str, message: CopilotMessage, proposals: list[CopilotProposal]) -> Conversation:
        """A message the copilot sends on its own, such as the coach's diagnosis or an autopilot step."""
        with self._conversations.editing(project_id) as stored:
            if proposals:
                _retire_open(stored)
            stored.messages.append(message)
            stored.proposals += proposals
        self._publish(MessagePostedEvent(type="message_posted", message_id=message.id, role=message.role), project_id)
        return self.conversation(project_id)

    def language(self, project_id: str) -> Language:
        """The language of the person's latest message, for what the copilot writes on its own."""
        conversation = self._conversations.read(project_id)
        latest = next((item for item in reversed(conversation.messages) if item.role == "user"), None)
        return detect(latest.text) if latest else "en"

    def conversation(self, project_id: str) -> Conversation:
        head = self._projects.state(project_id).revision.number
        with self._conversations.editing(project_id) as conversation:
            if not conversation.messages and not conversation.proposals and self._harness.welcome:
                opener, starters = welcome_message(self._projects.state(project_id).project)
                conversation.messages.append(opener)
                conversation.suggestions = [item.text for item in starters]
                conversation.suggestion_items = starters
            for proposal in conversation.proposals:
                if proposal.status == "open" and proposal.base_revision != head:
                    proposal.status = "outdated"
            return conversation.model_copy(deep=True)

    def set_autonomy(self, project_id: str, autonomy: Autonomy) -> Conversation:
        self._projects.state(project_id)
        with self._conversations.editing(project_id) as conversation:
            conversation.autonomy = autonomy
        return self.conversation(project_id)

    def forget(self, project_id: str) -> None:
        self._summaries.forget(project_id)

    def _client(self, media: TurnMedia) -> tuple[ModelClient, Capability, bool]:
        """The vision client for a turn with pictures when one is set, else the reasoning one; and whether it sees."""
        vision = capability_client(self._settings, "vision") if media.pictures else None
        return (vision, "vision", True) if vision else (copilot_client(self._settings), "reasoning", False)

    def send(self, project_id: str, message: SendMessage) -> Conversation:
        self._projects.state(project_id)
        with self._guard:
            lock = self._busy.setdefault(project_id, threading.Lock())
        if not lock.acquire(blocking=False):
            raise CopilotBusy(BUSY)
        try:
            return self._send(project_id, message)
        finally:
            lock.release()

    def _send(self, project_id: str, message: SendMessage) -> Conversation:
        media = turn_media(self._attachments, project_id, message)
        client, capability, sees = self._client(media)
        conversation = self.conversation(project_id)
        user_message = new_message("user", message.text, attachments=media.infos)
        if self._settings.refuses_tools(capability):
            return self._single_shot(project_id, message, media, client, sees, user_message)
        setup = self._setup(client, capability)
        try:
            result = run_turn(setup, conversation, message, media)
        except ToolsRefused:
            self._settings.record_tools_refused(capability)
            return self._single_shot(project_id, message, media, client, sees, user_message)
        except InputRejected:
            if not media.pictures or sees:
                raise
            return self._record(project_id, user_message, new_message("copilot", CANNOT_SEE))
        with self._conversations.editing(project_id) as stored:
            if result.proposals:
                _retire_open(stored)
            stored.messages += [user_message, result.message]
            stored.proposals += result.proposals
            stored.suggestions = result.suggestions
            stored.suggestion_items = result.suggestion_items
        return self.conversation(project_id)

    def _setup(self, client: ModelClient, capability: Capability) -> TurnSetup:
        harness = self._harness
        skills = skill_catalog_text() if self._tools is not None else ""
        return TurnSetup(
            self._services,
            self._settings,
            self._summaries,
            client,
            capability,
            self._limits,
            tools=self._tools,
            hooks=harness.hooks,
            publish=harness.publish,
            skills=skills,
            memory=harness.memory,
        )

    def subagent_loop(self, job: SubagentJob) -> SubagentOutcome:
        """A subagent's turn: the loop with the job's brief, tools, skills and budget, outside the conversation."""
        client = copilot_client(self._settings)
        state = self._projects.state(job.project_id)
        language = detect(job.brief)
        scope = TurnScope(job.project_id, state, job.autonomy, self._services, request=job.brief, language=language)
        available = worker_tools()
        scope.tools = {name: available[name] for name in job.tools if name in available}
        scope.hooks, scope.turn_id = self._harness.hooks, job.task_id

        def forward(event: EngineEvent) -> None:
            if event.type == "step":
                job.progress(min(len(scope.steps) / max(job.budget.max_steps, 1), 0.95), event.step.summary)
            self._publish(event, job.project_id)

        scope.publish = forward
        context = lean_context(state, self._runs, None, None, None)
        scope.sources.append(context)
        skills = skill_catalog_text() if job.skills else ""
        system = f"{system_prompt(job.autonomy, context, None, skills)}\n{SUBAGENT_NOTE}"
        wanted = f" Follow these skills: {', '.join(job.skills)}." if job.skills else ""
        messages = [{"role": "system", "content": system}, {"role": "user", "content": f"{job.brief}{wanted}"}]
        limits = replace(self._limits, max_model_calls=job.budget.max_steps, wall_seconds=job.budget.max_seconds)
        window = self._settings.context_tokens("reasoning") or limits.context_tokens
        outcome = run_loop(
            client, scope, messages, limits, window, inbox=job.next_messages, cancelled=lambda: job.token.cancelled
        )
        made = [*scope.applied, *([scope.proposal] if scope.proposal else [])]
        if scope.proposal is not None:
            with self._conversations.editing(job.project_id) as stored:
                _retire_open(stored)
                stored.proposals.append(scope.proposal)
        answer = outcome.final.answer if outcome.final else (outcome.failure or "")
        return SubagentOutcome(answer=answer, proposal_ids=tuple(item.id for item in made))

    def _single_shot(
        self,
        project_id: str,
        message: SendMessage,
        media: TurnMedia,
        client: ModelClient,
        sees: bool,
        user_message: CopilotMessage,
    ) -> Conversation:
        """One structured reply for services that refuse native tools; same validation, no steps."""
        state = self._projects.state(project_id)
        context = project_context(state, self._runs, message.selection, message.workspace)
        conversation = self.conversation(project_id)
        history = history_text(conversation)
        autopilot = conversation.autonomy == "autopilot"
        system = SYSTEM.format(
            autopilot=AUTOPILOT if autopilot else "", autonomy=conversation.autonomy, history=history, context=context
        )
        run_facts = json.dumps(json.loads(context)["latest_run"])
        heard = [message.text, history, *media.documents]
        review = Review(state.project, [context, *heard], [run_facts, *heard])
        try:
            reply = client.ask("chat_reply", ChatReply, system, media.user_content(message.text), review.check)
        except InputRejected:
            if not media.pictures or sees:
                raise
            return self._record(project_id, user_message, new_message("copilot", CANNOT_SEE))
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
        training = reply.value.training
        offered = training is not None and training.action == "start" and not autopilot
        actions = (
            [ChatAction(label="Apply", kind="apply"), ChatAction(label="Discard", kind="discard")] if proposal else []
        )
        actions += [ChatAction(label="Train now", kind="train")] if offered else []
        copilot_message = new_message(
            "copilot", answer, thinking=reply.thinking, proposal_id=proposal.id if proposal else None, actions=actions
        )
        with self._conversations.editing(project_id) as stored:
            if proposal:
                _retire_open(stored)
            stored.messages += [user_message, copilot_message]
            stored.proposals += [proposal] if proposal else []
            stored.suggestions = suggestions
        if proposal and autopilot:
            # The project may have moved on while the model answered; the proposal then stays visible as outdated.
            with contextlib.suppress(ProposalOutdated):
                self.apply(proposal.id)
        if training is not None and not offered:
            # After an autopilot change is applied, so a run started now trains the fixed revision.
            outcome = self._trainer.act(project_id, training, detect(message.text))
            with self._conversations.editing(project_id) as stored:
                for item in stored.messages:
                    if item.id == copilot_message.id:
                        item.text = f"{item.text} {outcome.text}"
        return self.conversation(project_id)

    def _record(self, project_id: str, user: CopilotMessage, answer: CopilotMessage) -> Conversation:
        with self._conversations.editing(project_id) as conversation:
            conversation.messages += [user, answer]
            conversation.suggestions = []
        return self.conversation(project_id)

    def _proposal(self, project: Project, base: int, draft: ProposalDraft) -> CopilotProposal:
        has_runs = bool(self._runs.list_runs(project.id))
        return new_proposal(project, base, draft.summary, draft.explanation, draft.operations, draft.warnings, has_runs)

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
        revision = self._projects.state(project_id).revision.number
        applied = ProposalAppliedEvent(type="proposal_applied", proposal_id=proposal_id, revision=revision)
        self._publish(applied, project_id)
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
