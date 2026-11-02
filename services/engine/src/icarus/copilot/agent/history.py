import re
from dataclasses import dataclass, field

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.copilot import Conversation, CopilotMessage
from icarus.copilot.agent.budget import AgentLimits, ceiling
from icarus.copilot.agent.prompt import history_message, rendered
from icarus.copilot.agent.summary_store import SummaryStore
from icarus.copilot.agent.tokens import text_tokens
from icarus.copilot.client import CopilotError, ModelClient

# Never fewer than the last two exchanges stay verbatim.
MIN_RECENT_MESSAGES = 4
LEFT_OUT = "(older messages left out)"

SUMMARY_SYSTEM = """You keep the memory of a conversation between a person and the copilot of Icarus Studio 3D, a
studio where people design worlds and bodies and train brains with reinforcement learning. Summarize the messages
below so the copilot can continue the conversation without them: what the person is trying to make, the choices
agreed and why, the changes proposed and applied or discarded (by summary and revision), the person's requests
still unanswered in their own words, their preferences (language, level, style, limits), and every object id, run
name and revision number that is still relevant. Write in the person's language. Keep it short."""
UPDATE = """Fold the newer messages into the existing summary. Newer messages win. Keep what is still true, drop
what is finished or superseded.
Existing summary:
{summary}
"""


class ConversationSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    goal: str = Field(max_length=400)
    decisions: list[str] = Field(max_length=8)
    changes: list[str] = Field(max_length=10)
    open_asks: list[str] = Field(max_length=5)
    preferences: list[str] = Field(max_length=5)
    identifiers: list[str] = Field(max_length=20)


@dataclass
class History:
    messages: list[dict]
    summary: str | None = None
    # The verbatim texts, which back numbers; a summary never does.
    sources: list[str] = field(default_factory=list)


def summary_text(summary: ConversationSummary) -> str:
    sections = [
        ("Goal", [summary.goal]),
        ("Decisions", summary.decisions),
        ("Changes", summary.changes),
        ("Open requests", summary.open_asks),
        ("Preferences", summary.preferences),
        ("Identifiers", summary.identifiers),
    ]
    return "\n".join(f"{title}: {'; '.join(items)}" for title, items in sections if any(items))


def missing_identifiers(summary: ConversationSummary, folded: str, live: set[str]) -> list[str]:
    """Ids still in the project that the summarized messages name but the summary lost."""
    written = f"{summary_text(summary)} {' '.join(summary.identifiers)}"
    named = {word for word in live if re.search(rf"(?<![\w-]){re.escape(word)}(?![\w-])", folded)}
    return sorted(word for word in named if word not in written)


def _summarize(client: ModelClient, folded: str, previous: str | None, live: set[str]) -> str:
    def check(summary: ConversationSummary) -> list[str]:
        missing = missing_identifiers(summary, folded, live)
        return [f"identifiers: keep these ids, they are still in the project: {', '.join(missing)}"] if missing else []

    system = SUMMARY_SYSTEM + ("\n" + UPDATE.format(summary=previous) if previous else "")
    # The check is retried once by the client; a summary that still misses ids is kept, the live context has them.
    reply = client.ask("conversation_summary", ConversationSummary, system, folded, check)
    return summary_text(reply.value)


def build_history(
    conversation: Conversation,
    store: SummaryStore,
    client: ModelClient,
    limits: AgentLimits,
    window: int,
    live: set[str],
) -> History:
    """Recent messages verbatim and, when they no longer fit, a rolling summary of the older ones."""
    messages = conversation.messages
    texts = [rendered(message, conversation) for message in messages]
    top = ceiling(window, limits)
    if sum(text_tokens(text) for text in texts) <= limits.history_share * top:
        return History([history_message(m, conversation) for m in messages], None, texts)
    keep = min(limits.keep_recent_tokens, int(0.2 * top))
    start, used = len(messages), 0
    while start > 0 and (used + text_tokens(texts[start - 1]) <= keep or len(messages) - start < MIN_RECENT_MESSAGES):
        start -= 1
        used += text_tokens(texts[start])
    older = messages[:start]
    kept_users = _older_users(older, texts, limits.keep_user_tokens)
    stored = store.read(conversation.project_id)
    covered = next((i for i, message in enumerate(older) if stored and message.id == stored.covers_until), None)
    fresh = older[covered + 1 :] if covered is not None else older
    summary = stored.summary if stored and covered is not None else None
    if fresh:
        folded = "\n".join(f"{m.role}: {texts[messages.index(m)]}" for m in fresh)
        try:
            summary = _summarize(client, folded, summary, live)
            store.write(conversation.project_id, summary, older[-1].id)
        except CopilotError:
            summary = f"{summary}\n{LEFT_OUT}" if summary else LEFT_OUT
    verbatim = [*kept_users, *messages[start:]]
    sources = [texts[messages.index(message)] for message in verbatim]
    return History([history_message(m, conversation) for m in verbatim], summary, sources)


def _older_users(older: list[CopilotMessage], texts: list[str], budget: int) -> list[CopilotMessage]:
    """The person's own older words, newest first within a budget, back in their original order."""
    kept: list[CopilotMessage] = []
    used = 0
    for index in range(len(older) - 1, -1, -1):
        if older[index].role != "user":
            continue
        cost = text_tokens(texts[index])
        if used + cost > budget:
            break
        kept.insert(0, older[index])
        used += cost
    return kept
