import json
import secrets
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from icarus.contracts.copilot import (
    Capability,
    ChatSuggestion,
    Conversation,
    CopilotMessage,
    CopilotProposal,
    RunCard,
    SendMessage,
)
from icarus.contracts.events import EngineEvent, TurnFinishedEvent, TurnStartedEvent
from icarus.copilot.agent.answer import chat_actions
from icarus.copilot.agent.budget import AgentLimits
from icarus.copilot.agent.ending import finish_autopilot, listed_options, polished
from icarus.copilot.agent.history import build_history
from icarus.copilot.agent.loop import merged_steps, run_loop
from icarus.copilot.agent.prompt import system_prompt
from icarus.copilot.agent.summary_store import SummaryStore
from icarus.copilot.agent.tools.base import Tool, ToolServices, TurnScope
from icarus.copilot.client import CopilotError, ModelClient, capability_client
from icarus.copilot.context import lean_context
from icarus.copilot.hooks import HookRegistry
from icarus.copilot.language import detect, say
from icarus.copilot.settings import ModelSettingsStore
from icarus.copilot.turn_media import TurnMedia
from icarus.projects.document import all_objects

THINKING_LIMIT = 8_000


def new_message(role: str, text: str, **fields: object) -> CopilotMessage:
    return CopilotMessage.model_validate(
        {"id": secrets.token_hex(6), "role": role, "text": text, "created_at": datetime.now(UTC), **fields}
    )


@dataclass(frozen=True)
class TurnResult:
    message: CopilotMessage
    # Proposals this message made: those applied in autopilot, then the open one.
    proposals: list[CopilotProposal]
    suggestions: list[str]
    suggestion_items: list[ChatSuggestion] = field(default_factory=list)


@dataclass(frozen=True)
class TurnSetup:
    services: ToolServices
    settings: ModelSettingsStore
    summaries: SummaryStore
    client: ModelClient
    capability: Capability
    limits: AgentLimits
    # The chat's tools with the harness extensions; none means the agent's own registry.
    tools: dict[str, Tool[Any]] | None = None
    hooks: HookRegistry | None = None
    publish: Callable[[EngineEvent, str | None], None] | None = None
    # The skill catalog lines for the prompt, and the memory section for one turn's scope and message.
    skills: str = ""
    memory: Callable[[TurnScope, str], str] | None = None


def _open_proposal(conversation: Conversation) -> str | None:
    found = next((item for item in reversed(conversation.proposals) if item.status == "open"), None)
    return f"{found.id}: {found.summary}" if found else None


def _scope(setup: TurnSetup, conversation: Conversation, message: SendMessage) -> tuple[TurnScope, str]:
    services, project_id = setup.services, conversation.project_id
    state = services.projects.state(project_id)
    context = lean_context(state, services.runs, message.selection, message.workspace, _open_proposal(conversation))
    language = detect(message.text)
    scope = TurnScope(project_id, state, conversation.autonomy, services, request=message.text, language=language)
    scope.earlier_proposal = any(item.status == "open" for item in conversation.proposals)
    scope.tools, scope.hooks, scope.turn_id = setup.tools, setup.hooks, secrets.token_hex(6)
    scope.client, scope.attachments = setup.client, list(message.attachments)
    scope.vision = setup.client if setup.capability == "vision" else capability_client(setup.settings, "vision")
    publish = setup.publish
    if publish is not None:
        scope.publish = lambda event: publish(event, project_id)
    return scope, context


def _text(answer: str, reports: list[str]) -> str:
    """The model's answer plus what the engine did that the answer does not already say."""
    added = [report for report in reports if report not in answer]
    return " ".join([answer, *added])


def run_turn(setup: TurnSetup, conversation: Conversation, message: SendMessage, media: TurnMedia) -> TurnResult:
    """One agent turn, between its turn_started and turn_finished events."""
    scope, context = _scope(setup, conversation, message)
    scope.emit(TurnStartedEvent(type="turn_started", turn_id=scope.turn_id))
    result: TurnResult | None = None
    try:
        result = _turn(setup, scope, context, conversation, message, media)
        return result
    finally:
        message_id = result.message.id if result else None
        finished = TurnFinishedEvent(
            type="turn_finished", turn_id=scope.turn_id, message_id=message_id, ok=bool(result)
        )
        scope.emit(finished)


def _turn(
    setup: TurnSetup,
    scope: TurnScope,
    context: str,
    conversation: Conversation,
    message: SendMessage,
    media: TurnMedia,
) -> TurnResult:
    """The prompt, the loop, and its outcome mapped onto the copilot message."""
    window = setup.settings.context_tokens(setup.capability) or setup.limits.context_tokens
    live = {body.id for body in scope.state.project.bodies} | {obj.id for obj in all_objects(scope.state.project)}
    live |= {status.name for status in setup.services.runs.list_runs(scope.project_id)}
    history = build_history(conversation, setup.summaries, setup.client, setup.limits, window, live)
    run_headline = json.dumps(json.loads(context)["latest_run"])
    heard = [message.text, *history.sources, *media.documents]
    scope.sources += [context, *heard]
    scope.percent_sources += [run_headline, *heard]
    memory = setup.memory(scope, message.text) if setup.memory else ""
    system = system_prompt(scope.autonomy, context, history.summary, setup.skills, memory)
    messages = [{"role": "system", "content": system}, *history.messages]
    messages.append({"role": "user", "content": media.user_content(message.text)})
    # The loop's own budget starts now, so tools that plan with a model know when the turn ends.
    scope.deadline = time.monotonic() + setup.limits.wall_seconds
    outcome = run_loop(
        setup.client,
        scope,
        messages,
        setup.limits,
        window,
        on_overflow=lambda tokens: setup.settings.learn_context(setup.capability, tokens),
    )
    if outcome.final is None:
        failure = outcome.failure or "The model did not answer"
        # Nothing was done, so there is nothing to keep: the person gets the error and may send again.
        if not scope.side_effects and not scope.steps:
            raise CopilotError(failure)
        done = " ".join(scope.side_effects)
        key = "failed_after" if done else "failed"
        answer, suggestions, drafts = say(key, scope.language, done=done, failure=failure), [], []
        final = None
    else:
        final = outcome.final
        answer, suggestions, drafts = final.answer, final.suggestions, final.actions
    if scope.autonomy == "autopilot":
        finish_autopilot(scope, message.text)
    answer = polished(scope, answer)
    options = listed_options(answer)
    text = _text(answer, scope.reports)
    suggestions = [polished(scope, item) for item in suggestions]
    items = final.suggestion_items() if final else []
    items = [item.model_copy(update={"text": text[:120]}) for item, text in zip(items, suggestions, strict=False)]
    proposals = [*scope.applied, *([scope.proposal] if scope.proposal else [])]
    proposal_id = proposals[-1].id if proposals else None
    thinking = "\n\n".join(outcome.thinking)[:THINKING_LIMIT] or None
    reply = new_message(
        "copilot",
        text,
        thinking=thinking,
        proposal_id=proposal_id,
        attachments=scope.views,
        actions=chat_actions(scope, drafts, options),
        steps=merged_steps(scope.steps),
        title=final.title if final else None,
        checks=final.checks if final else [],
        plan=final.plan if final else [],
        run=RunCard(run_id=scope.started_runs[-1]) if scope.started_runs else None,
    )
    return TurnResult(reply, proposals, suggestions, items)
