"""The copilot's tools over subagents: delegate a job, message it, read its result and list them."""

from typing import Any

from pydantic import Field

from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TurnScope
from icarus.copilot.language import Language
from icarus.copilot.subagents import (
    MESSAGE_CHARS,
    SubagentBudget,
    SubagentRefused,
    SubagentResult,
    Subagents,
    UnknownSubagent,
)

_SAID: dict[str, dict[Language, str]] = {
    "delegated": {"en": "Handed off: {brief}", "es": "Encargué: {brief}"},
    "refused": {"en": "Could not hand that off", "es": "No pude encargar eso"},
    "messaged": {"en": "Sent a note to a helper", "es": "Envié una nota a un ayudante"},
    "result": {"en": "Read a helper's result", "es": "Leí el resultado de un ayudante"},
    "missing": {"en": "Looked for a helper that does not exist", "es": "Busqué un ayudante que no existe"},
    "listed": {"en": "Listed {count} helpers", "es": "Revisé {count} ayudantes"},
}


def said(key: str, language: Language, **values: object) -> str:
    return _SAID[key][language].format(**values)[:200]


class DelegateArgs(ToolArgs):
    brief: str = Field(min_length=1, max_length=2_000, description="The whole job in words: goal, limits, done means.")
    skills: list[str] = Field(default_factory=list, max_length=3, description="Skill names the subagent follows.")
    tools: list[str] = Field(min_length=1, max_length=12, description="The tool names it may use, nothing more.")
    max_steps: int = Field(default=12, ge=1, le=40)
    max_minutes: int = Field(default=10, ge=1, le=30)


class MessageTaskArgs(ToolArgs):
    task_id: str = Field(min_length=1, max_length=64)
    text: str = Field(min_length=1, max_length=MESSAGE_CHARS, description="Read by the subagent at its next step.")


class TaskResultArgs(ToolArgs):
    task_id: str = Field(min_length=1, max_length=64)


class TasksArgs(ToolArgs):
    pass


def _describe(result: SubagentResult) -> str:
    lines = [f"Subagent {result.task_id} ({result.state}): {result.brief[:120]}"]
    if result.answer:
        lines.append(f"Answer: {result.answer}")
    if result.proposal_ids:
        lines.append(f"Proposals: {', '.join(result.proposal_ids)}")
    if result.reason:
        lines.append(f"Reason: {result.reason}")
    return "\n".join(lines)


def subagent_tools(hub: Subagents) -> dict[str, Tool[Any]]:
    """The four tools over one hub; only the conversation's own loop gets them, never a subagent."""

    def mine(scope: TurnScope, task_id: str) -> SubagentResult | None:
        try:
            result = hub.result(task_id)
        except UnknownSubagent:
            return None
        return result if result.project_id == scope.project_id else None

    def delegate(scope: TurnScope, args: DelegateArgs) -> Observation:
        budget = SubagentBudget(max_steps=args.max_steps, max_seconds=args.max_minutes * 60.0)
        try:
            info = hub.delegate(
                scope.project_id, args.brief, tuple(args.skills), tuple(args.tools), budget, scope.autonomy
            )
        except SubagentRefused as error:
            return Observation(str(error), ok=False, summary=said("refused", scope.language))
        text = f"Started subagent {info.id}. It works in the background; read it later with task_result."
        return Observation(text, summary=said("delegated", scope.language, brief=args.brief[:120]))

    def message_task(scope: TurnScope, args: MessageTaskArgs) -> Observation:
        if mine(scope, args.task_id) is None:
            return Observation(
                f"There is no subagent {args.task_id}.", ok=False, summary=said("missing", scope.language)
            )
        try:
            hub.message(args.task_id, args.text)
        except UnknownSubagent as error:
            return Observation(str(error), ok=False, summary=said("missing", scope.language))
        return Observation(f"Queued for subagent {args.task_id}.", summary=said("messaged", scope.language))

    def task_result(scope: TurnScope, args: TaskResultArgs) -> Observation:
        result = mine(scope, args.task_id)
        if result is None:
            return Observation(
                f"There is no subagent {args.task_id}.", ok=False, summary=said("missing", scope.language)
            )
        return Observation(_describe(result), summary=said("result", scope.language))

    def tasks(scope: TurnScope, args: TasksArgs) -> Observation:
        results = hub.of_project(scope.project_id)
        text = "\n".join(_describe(result) for result in results) or "No subagents in this project."
        return Observation(text, summary=said("listed", scope.language, count=len(results)))

    built: tuple[Tool[Any], ...] = (
        Tool(
            name="delegate",
            description=(
                "Hand a self-contained job to a subagent that works in the background with its own budget, the "
                "skills and the tools you name. Returns its task id at once. At most 3 per project; it cannot "
                "apply unless the conversation is in autopilot."
            ),
            args=DelegateArgs,
            step="inspect",
            effect="read",
            run=delegate,
            per_turn=3,
            timeout_s=5,
        ),
        Tool(
            name="message_task",
            description="Send a note to a running subagent; it reads it at its next step.",
            args=MessageTaskArgs,
            step="inspect",
            effect="read",
            run=message_task,
            per_turn=5,
            timeout_s=5,
        ),
        Tool(
            name="task_result",
            description="Read a subagent's state, final answer and the ids of the proposals it made.",
            args=TaskResultArgs,
            step="inspect",
            effect="read",
            run=task_result,
            per_turn=6,
            timeout_s=5,
        ),
        Tool(
            name="tasks",
            description="List this project's subagents with their state and answers.",
            args=TasksArgs,
            step="inspect",
            effect="read",
            run=tasks,
            per_turn=3,
            timeout_s=5,
        ),
    )
    return {tool.name: tool for tool in built}
