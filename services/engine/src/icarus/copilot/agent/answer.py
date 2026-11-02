import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.copilot import ChatAction
from icarus.copilot.agent.tools.base import TurnScope
from icarus.copilot.grounding import unsupported_numbers, without_unbacked
from icarus.copilot.language import claims_change, points_to_apply, say
from icarus.training.run_store import TERMINAL_STATES

# Screens and states a navigate button may open, from docs/design/screens.md; Results joins once it works.
WORKSPACES = (
    "SCR-WORLD",
    "SCR-BODY",
    "SCR-BRAIN",
    "STA-BRAIN-NETWORK",
    "SCR-TRAIN",
    "SCR-PLAY",
)
MAX_ACTIONS = 4


class _Output(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ActionDraft(_Output):
    label: str = Field(min_length=1, max_length=60, description="The button text, in the person's language.")
    # Apply and discard are added by the engine for an open proposal, never by the model.
    kind: Literal["navigate", "send", "train"]
    target: str | None = Field(
        default=None,
        max_length=400,
        description=f"navigate: one of {', '.join(WORKSPACES)}. send: the message to send. train: none.",
    )


class FinalAnswer(_Output):
    answer: str = Field(min_length=1, max_length=4000, description="Your answer, in the person's language.")
    suggestions: list[str] = Field(default=[], max_length=3, description="Up to three short follow-up questions.")
    actions: list[ActionDraft] = Field(default=[], max_length=2, description="Up to two buttons under the answer.")


def _unbacked(scope: TurnScope, text: str) -> list[str]:
    return unsupported_numbers(text, scope.sources, scope.percent_sources)


def _trainable(scope: TurnScope) -> bool:
    if scope.state.project.task.family == "none":
        return False
    runs = scope.services.runs.list_runs(scope.project_id)
    return not any(status.state not in TERMINAL_STATES for status in runs)


def action_problem(scope: TurnScope, action: ActionDraft) -> str | None:
    match action.kind:
        case "navigate":
            if action.target not in WORKSPACES:
                return f"navigate target {action.target!r} is not one of {', '.join(WORKSPACES)}"
        case "train":
            if not _trainable(scope):
                return "a train button needs a project with a task and no run training"
        case "send":
            if not action.target:
                return "a send button needs the message to send in target"
    return None


def _false_claim(scope: TurnScope, text: str) -> bool:
    """An answer saying the change was made while it is only proposed and the person still applies it."""
    return scope.autonomy == "ask" and scope.proposal is not None and claims_change(text)


def _phantom_proposal(scope: TurnScope, text: str) -> bool:
    """An answer pointing to Apply, or to a change it proposed, while this turn left nothing to apply."""
    return scope.proposal is None and not scope.applied and not scope.earlier_proposal and points_to_apply(text)


def _without_phantom(text: str) -> str:
    sentences = re.split(r"(?<=[.!?])\s+", text)
    return " ".join(sentence for sentence in sentences if not points_to_apply(sentence))


def check(scope: TurnScope, final: FinalAnswer) -> list[str]:
    """What is wrong with an answer: unbacked numbers, a change claimed but only proposed, buttons that cannot work."""
    problems: list[str] = []
    unbacked = [*_unbacked(scope, final.answer)]
    unbacked += [number for text in final.suggestions for number in _unbacked(scope, text)]
    if unbacked:
        problems.append(
            f"These numbers are not in the context, the tool results or the conversation: {', '.join(unbacked)}. "
            "Rewrite only those sentences with figures from the tool results, the context or the person's words "
            "(or say the value is not known); keep the rest of your answer and do not shorten it."
        )
    if _false_claim(scope, final.answer):
        problems.append(
            "Your answer says the change was made, but it is only proposed: the person adds it with Apply. Say what "
            "you propose and that Apply adds it."
        )
    if _phantom_proposal(scope, final.answer):
        problems.append(
            "Your answer sends the person to Apply or says you proposed a change, but this turn has no open "
            "proposal: nothing is waiting to be applied. Either try the change and propose it now, or describe what "
            "you would change and ask whether to prepare it, without mentioning Apply."
        )
    problems += [problem for action in final.actions if (problem := action_problem(scope, action))]
    return problems


def degraded(scope: TurnScope, final: FinalAnswer) -> FinalAnswer:
    """The answer after its one retry still failed: only its unbacked sentences go, and a false claim is corrected."""
    text = without_unbacked(final.answer, scope.sources, scope.percent_sources) or say("unsupported", scope.language)
    if _false_claim(scope, text):
        text = f"{say('proposed_not_applied', scope.language)} {text}"
    if _phantom_proposal(scope, text):
        text = f"{say('nothing_proposed', scope.language)} {_without_phantom(text)}".strip()
    suggestions = [item for item in final.suggestions if not _unbacked(scope, item)]
    actions = [action for action in final.actions if action_problem(scope, action) is None]
    return FinalAnswer(answer=text, suggestions=suggestions, actions=actions)


def chat_actions(scope: TurnScope, drafts: list[ActionDraft], options: list[tuple[str, str]]) -> list[ChatAction]:
    """The engine's buttons first (the open proposal, a training start held back), then one per option the answer
    lists, then the model's, deduplicated."""
    language = scope.language
    actions: list[ChatAction] = []
    if scope.proposal is not None:
        actions += [
            ChatAction(label=say("apply", language), kind="apply"),
            ChatAction(label=say("discard", language), kind="discard"),
        ]
    if scope.train_offered and _trainable(scope):
        actions.append(ChatAction(label=say("train_now", language), kind="train"))
    actions += [ChatAction(label=label, kind="send", target=message) for label, message in options]
    actions += [ChatAction(label=draft.label, kind=draft.kind, target=draft.target) for draft in drafts]
    unique: list[ChatAction] = []
    for action in actions:
        if not any((item.kind, item.target) == (action.kind, action.target) for item in unique):
            unique.append(action)
    return unique[:MAX_ACTIONS]
