from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.copilot import ChatAction
from icarus.copilot.agent.tools.base import TurnScope
from icarus.copilot.grounding import UNSUPPORTED_ANSWER, unsupported_numbers
from icarus.training.run_store import TERMINAL_STATES

# Screens and states a navigate button may open, from docs/design/screens.md.
WORKSPACES = (
    "SCR-WORLD",
    "SCR-BODY",
    "SCR-BRAIN",
    "STA-BRAIN-NETWORK",
    "SCR-TRAIN",
    "SCR-RESULTS",
    "STA-RESULTS-FAILURES",
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


def check(scope: TurnScope, final: FinalAnswer) -> list[str]:
    """What is wrong with an answer: unbacked numbers and buttons that cannot work."""
    problems: list[str] = []
    unbacked = [*_unbacked(scope, final.answer)]
    unbacked += [number for text in final.suggestions for number in _unbacked(scope, text)]
    if unbacked:
        problems.append(
            f"These numbers are not in the context, the tool results or the conversation: {', '.join(unbacked)}"
        )
    problems += [problem for action in final.actions if (problem := action_problem(scope, action))]
    return problems


def degraded(scope: TurnScope, final: FinalAnswer) -> FinalAnswer:
    """The answer after its one retry still failed: unbacked parts are replaced or dropped, as every role does."""
    text = UNSUPPORTED_ANSWER if _unbacked(scope, final.answer) else final.answer
    suggestions = [item for item in final.suggestions if not _unbacked(scope, item)]
    actions = [action for action in final.actions if action_problem(scope, action) is None]
    return FinalAnswer(answer=text, suggestions=suggestions, actions=actions)


def chat_actions(scope: TurnScope, drafts: list[ActionDraft]) -> list[ChatAction]:
    """The engine's buttons first (the open proposal, a training start held back), then the model's, deduplicated."""
    actions: list[ChatAction] = []
    if scope.proposal is not None:
        actions += [ChatAction(label="Apply", kind="apply"), ChatAction(label="Discard", kind="discard")]
    if scope.train_offered and _trainable(scope):
        actions.append(ChatAction(label="Train now", kind="train"))
    actions += [ChatAction(label=draft.label, kind=draft.kind, target=draft.target) for draft in drafts]
    unique: list[ChatAction] = []
    for action in actions:
        if not any((item.kind, item.target) == (action.kind, action.target) for item in unique):
            unique.append(action)
    return unique[:MAX_ACTIONS]
