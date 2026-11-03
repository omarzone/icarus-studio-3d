"""The context meter: what the next turn's first step would send, built like a turn and measured with the budget's
own counter, without calling a model."""

import json
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

from icarus.contracts.context_usage import (
    ContextCategory,
    ContextCompaction,
    ContextItem,
    ContextPart,
    ContextRequest,
    ContextUsage,
)
from icarus.contracts.copilot import Capability, Conversation
from icarus.copilot.agent.budget import AgentLimits, ceiling
from icarus.copilot.agent.history import fold_threshold, history_tokens, plan_history
from icarus.copilot.agent.loop import definitions
from icarus.copilot.agent.prompt import SUMMARY_PREAMBLE, history_message
from icarus.copilot.agent.summary_store import SummaryStore
from icarus.copilot.agent.tokens import IMAGE_TOKENS, message_tokens, text_tokens
from icarus.copilot.agent.tools.base import Tool, ToolServices, TurnScope
from icarus.copilot.agent.turn import turn_prompt, turn_scope, turn_window
from icarus.copilot.attachments import AttachmentStore
from icarus.copilot.settings import ModelSettingsStore, answers_from_fixtures
from icarus.copilot.turn_media import TurnMedia

LABEL_CHARS = 80


@dataclass(frozen=True)
class MeterSources:
    """What a turn is built from, the same pieces the chat hands its turns."""

    services: ToolServices
    settings: ModelSettingsStore
    summaries: SummaryStore
    attachments: AttachmentStore
    limits: AgentLimits
    tools: dict[str, Tool[Any]] | None
    skills: str
    memory: Callable[[TurnScope, str], str] | None


@dataclass(frozen=True)
class _Piece:
    label: str
    chars: int
    pictures: int = 0


def apportion(total: int, weights: Sequence[int]) -> list[int]:
    """`total` split in proportion to `weights`, rounded so the parts add up to it exactly."""
    whole = sum(weights)
    if not weights:
        return []
    if whole <= 0:
        return [total, *([0] * (len(weights) - 1))]
    bounds, running = [], 0
    for weight in weights:
        running += weight
        bounds.append(total * running // whole)
    return [end - start for start, end in zip([0, *bounds], bounds, strict=False)]


def _label(text: str) -> str:
    line = text.strip().removeprefix("- ")
    return line if len(line) <= LABEL_CHARS else f"{line[: LABEL_CHARS - 1]}…"


def _category(part: ContextPart, tokens: int, labels: list[str], weights: list[int]) -> ContextCategory:
    items = [
        ContextItem(label=label, tokens=share) for label, share in zip(labels, apportion(tokens, weights), strict=True)
    ]
    return ContextCategory(part=part, tokens=tokens, items=items)


def _media(store: AttachmentStore, project_id: str, request: ContextRequest) -> tuple[TurnMedia, list[_Piece]]:
    """The message's media as the turn builds it, with what each attachment adds to it."""
    media, pieces = TurnMedia(), []
    for index in range(request.scene_views):
        lines, pictures = len(media.lines), len(media.pictures)
        media.expect_views(1)
        added = sum(len(line) + 1 for line in media.lines[lines:])
        pieces.append(_Piece(f"Scene render {index + 1}", added, len(media.pictures) - pictures))
    for attachment in store.of_project(project_id, request.attachments):
        lines, pictures = len(media.lines), len(media.pictures)
        media.add(attachment)
        added = sum(len(line) + 1 for line in media.lines[lines:])
        pieces.append(_Piece(attachment.info.name, added, len(media.pictures) - pictures))
    return media, pieces


def capability_for(settings: ModelSettingsStore, media: TurnMedia) -> Capability:
    """The capability the chat would pick: vision for a message with pictures when a vision model is set."""
    return "vision" if media.pictures and settings.connection("vision") else "reasoning"


def _model(settings: ModelSettingsStore, capability: Capability) -> str | None:
    if capability == "reasoning" and answers_from_fixtures():
        return "fixtures"
    connection = settings.connection(capability)
    return connection.model if connection else None


def _system(system: dict, skills: str, memory: str, summary: str | None, context: str) -> list[ContextCategory]:
    """The system message split into its instructions and the sections inserted into it."""
    text = str(system["content"])
    skills_text = f"{skills}\n" if skills else ""
    memory_text = f"{memory}\n" if memory else ""
    summary_text = SUMMARY_PREAMBLE.format(summary=summary) if summary else ""
    inserted = [len(skills_text), len(memory_text), len(summary_text), len(context)]
    base, skill_tokens, memory_tokens, summary_tokens, project_tokens = apportion(
        message_tokens(system), [len(text) - sum(inserted), *inserted]
    )
    skill_lines = skills.splitlines() if skills else []
    memory_lines = memory.splitlines() if memory else []
    facts = json.loads(context)
    project = facts if isinstance(facts, dict) else {}
    return [
        ContextCategory(part="system", tokens=base),
        _category(
            "skills",
            skill_tokens,
            ["How skills are used", *(_label(line) for line in skill_lines[1:])],
            [len(line) + 1 for line in skill_lines],
        )
        if skill_lines
        else ContextCategory(part="skills", tokens=skill_tokens),
        _category(
            "memory",
            memory_tokens,
            ["How notes are read", *(_label(line) for line in memory_lines[1:])],
            [len(line) + 1 for line in memory_lines],
        )
        if memory_lines
        else ContextCategory(part="memory", tokens=memory_tokens),
        ContextCategory(part="summary", tokens=summary_tokens),
        _category(
            "project",
            project_tokens,
            [key.replace("_", " ").capitalize() for key in project],
            [len(json.dumps(value)) + len(key) for key, value in project.items()],
        )
        if project
        else ContextCategory(part="project", tokens=project_tokens),
    ]


def _history(messages: list[dict]) -> ContextCategory:
    yours = [message_tokens(message) for message in messages if message["role"] == "user"]
    answers = [message_tokens(message) for message in messages if message["role"] != "user"]
    items = [
        ContextItem(label=f"Your messages ({len(yours)})", tokens=sum(yours)),
        ContextItem(label=f"Copilot answers ({len(answers)})", tokens=sum(answers)),
    ]
    return ContextCategory(part="history", tokens=sum(yours) + sum(answers), items=[i for i in items if i.tokens])


def _message(user: dict, pieces: list[_Piece]) -> list[ContextCategory]:
    """The person's turn: the words and framing, then each attachment's lines and pictures."""
    pictures = sum(piece.pictures for piece in pieces)
    content = user["content"]
    written = str(content[0]["text"]) if isinstance(content, list) else str(content)
    lines = [piece.chars for piece in pieces]
    shares = apportion(message_tokens(user) - pictures * IMAGE_TOKENS, [len(written) - sum(lines), *lines])
    items = [
        ContextItem(label=piece.label, tokens=share + piece.pictures * IMAGE_TOKENS)
        for piece, share in zip(pieces, shares[1:], strict=True)
    ]
    return [
        ContextCategory(part="message", tokens=shares[0]),
        ContextCategory(part="attachments", tokens=sum(item.tokens for item in items), items=items),
    ]


def measure_context(sources: MeterSources, conversation: Conversation, request: ContextRequest) -> ContextUsage:
    media, pieces = _media(sources.attachments, conversation.project_id, request)
    capability = capability_for(sources.settings, media)
    limits = sources.limits
    window = turn_window(sources.settings, capability, limits)
    scope, context = turn_scope(sources.services, conversation, request)
    plan = plan_history(conversation, sources.summaries, limits, window)
    history = [history_message(message, conversation) for message in plan.verbatim]
    memory = sources.memory(scope, request.text) if sources.memory else ""
    user = media.user_content(request.text)
    messages = turn_prompt(scope, context, plan.summary, history, user, sources.skills, memory)
    tools = definitions(sources.tools)
    tool_tokens = text_tokens(json.dumps(tools))
    categories = [
        *_system(messages[0], sources.skills, memory, plan.summary, context),
        _category(
            "tools",
            tool_tokens,
            [str(tool["function"]["name"]) for tool in tools],
            [len(json.dumps(tool)) + 2 for tool in tools],
        ),
        _history(messages[1:-1]),
        *_message(messages[-1], pieces),
    ]
    order: list[ContextPart] = [
        "system",
        "tools",
        "skills",
        "memory",
        "project",
        "summary",
        "history",
        "message",
        "attachments",
    ]
    categories.sort(key=lambda category: order.index(category.part))
    used = sum(category.tokens for category in categories)
    top = ceiling(window, limits)
    return ContextUsage(
        capability=capability,
        model=_model(sources.settings, capability),
        window=window,
        window_known=sources.settings.context_tokens(capability) is not None,
        used=used,
        reserve=window - top,
        free=max(0, top - used),
        categories=categories,
        compaction=ContextCompaction(
            history_tokens=history_tokens(plan.texts),
            fold_at=fold_threshold(limits, window),
            folding=plan.folds,
            folds_next_turn=plan.folds and bool(plan.fresh),
            prune_at=int(limits.prune_ratio * top),
        ),
    )
