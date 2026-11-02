import base64
import json
import logging
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FutureTimeout
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, ValidationError

from icarus.contracts.copilot import AgentStep
from icarus.copilot.agent import answer
from icarus.copilot.agent.answer import FinalAnswer
from icarus.copilot.agent.budget import AgentLimits, TurnBudget, ceiling
from icarus.copilot.agent.compaction import fit_step, prune_observations, retire_pictures, strip_pictures, truncate
from icarus.copilot.agent.notes import PICTURES_NOTE
from icarus.copilot.agent.permissions import permission
from icarus.copilot.agent.prompt import ANSWER_REJECTED, EMPTY_NUDGE, PROPOSE_STILL, RESTATE, WRAP_UP
from icarus.copilot.agent.tokens import estimate
from icarus.copilot.agent.tools import REGISTRY
from icarus.copilot.agent.tools.base import Effect, Observation, Tool, TurnScope, tool_definition
from icarus.copilot.client import ContextOverflow, CopilotError, InputRejected, ModelClient, ToolCall, schema_problems
from icarus.copilot.language import say
from icarus.copilot.step_words import STEP_TEXTS, step_said

log = logging.getLogger(__name__)

_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="agent-tools")
ANSWER_TOOL = "answer"
HINTS = {
    "inspect_object": "Ask inspect_object for one part instead of the whole body.",
    "read_run": "Ask read_run for fewer sections.",
    "library": "Ask library for one exact kind.",
}
TOOLS_OFF = "Tools are off for the rest of this turn"
NO_ROOM = (
    "The conversation no longer fits the model; start a new conversation or set a model with a larger context "
    "in Settings"
)
STEP_LIMIT = 20


def definitions() -> list[dict[str, Any]]:
    tools = [tool_definition(tool.name, tool.description, tool.args) for tool in REGISTRY.values()]
    finish = "End the turn: your answer to the person, follow-up suggestions and buttons. Always finish with it."
    return [*tools, tool_definition(ANSWER_TOOL, finish, FinalAnswer)]


@dataclass
class LoopOutcome:
    final: FinalAnswer | None
    failure: str | None = None
    thinking: list[str] = field(default_factory=list)


@dataclass
class _Planned:
    call: ToolCall
    tool: Tool[Any] | None = None
    args: BaseModel | None = None
    effect: Effect = "read"
    result: Observation | None = None


@dataclass
class _Batch:
    messages: list[dict]
    images: list[tuple[str, bytes]]
    final: FinalAnswer | None = None
    answer_call: ToolCall | None = None
    # Each call's step line, so a pruned result can still say what it was.
    summaries: dict[str, str] = field(default_factory=dict)


def note(text: str) -> dict:
    return {"role": "user", "content": text}


def _rejected(scope: TurnScope, tool: Tool[Any] | None, text: str, reason: str) -> Observation:
    """A call the engine did not run; reason is a step_words key without its reason_ prefix."""
    language = scope.language
    verb = step_said(f"verb_{tool.name}" if tool and f"verb_{tool.name}" in STEP_TEXTS else "verb_act", language)
    return Observation(
        text,
        ok=False,
        summary=step_said("rejected", language, verb=verb, reason=step_said(f"reason_{reason}", language)),
    )


def _encoded(data: dict[str, Any]) -> list[str]:
    """Fields sent as a string that holds JSON, a common slip; told back to the model, never decoded for it."""
    hints = []
    for key, value in data.items():
        if isinstance(value, str) and value.strip()[:1] in ("[", "{"):
            hints.append(
                f"- {key}: you sent a string that contains JSON; send the JSON array or object itself, "
                f'like {{"{key}": [{{...}}]}} and not {{"{key}": "[{{...}}]"}}'
            )
    return hints


def _plan(scope: TurnScope, call: ToolCall, budget: TurnBudget, off: frozenset[str] | None, index: int) -> _Planned:
    """Parse, validate, permit and count one call; nothing runs here."""
    tool = REGISTRY.get(call.name)
    planned = _Planned(call, tool)
    if tool is None:
        listed = ", ".join([*REGISTRY, ANSWER_TOOL])
        text = "The tool name was empty; call a tool from your list or answer." if not call.name else ""
        planned.result = Observation(text or f"No tool named `{call.name}`. Available: {listed}", ok=False)
        return planned
    if off is not None and tool.name not in off:
        planned.result = _rejected(scope, tool, TOOLS_OFF, "tools_off")
        return planned
    if index >= budget.limits.max_calls_per_step:
        text = "Too many calls in one step; call it again next step if you still need it"
        planned.result = _rejected(scope, tool, text, "too_many")
        return planned
    try:
        data = json.loads(call.arguments or "{}")
    except ValueError:
        data = None
    if not isinstance(data, dict):
        planned.result = _rejected(scope, tool, "Arguments must be one JSON object; the tool was not run.", "not_json")
        return planned
    try:
        args = tool.args.model_validate(data)
    except ValidationError as error:
        listed = "\n".join([*(f"- {problem}" for problem in schema_problems(error)), *_encoded(data)])
        planned.result = _rejected(
            scope, tool, f"The arguments do not fit; the tool was not run:\n{listed}", "did_not_fit"
        )
        return planned
    key = (call.name, " ".join(call.arguments.split()))
    if budget.repeated[key] >= 2:
        budget.force("repeated")
        planned.result = _rejected(scope, tool, "You already did this twice; the result has not changed.", "repeated")
        return planned
    budget.repeated[key] += 1
    allowed, why = permission(tool.name, args, scope.autonomy)
    if allowed == "deny":
        planned.result = _rejected(scope, tool, why, "ask_mode")
        return planned
    capped = budget.cap_reached(tool.name)
    if capped:
        planned.result = _rejected(scope, tool, capped, "limit")
        return planned
    budget.tool_calls[tool.name] += 1
    if allowed == "offer":
        scope.train_offered = True
        planned.result = Observation(why, summary=step_said("train_offered", scope.language))
        return planned
    planned.args, planned.effect = args, tool.effect_for(args)
    return planned


def _run(scope: TurnScope, item: _Planned, budget: TurnBudget) -> None:
    tool, args = item.tool, item.args
    if tool is None or args is None:
        return
    try:
        item.result = tool.run(scope, args)
    except Exception as error:  # A tool bug is told to the model instead of ending the person's turn.
        log.exception("copilot tool %s failed", tool.name)
        item.result = _rejected(scope, tool, f"The tool failed: {error}", "failed")


def _run_parallel(scope: TurnScope, items: list[_Planned], budget: TurnBudget) -> None:
    futures = [(item, _POOL.submit(_run, scope, item, budget)) for item in items]
    for item, future in futures:
        tool = item.tool
        assert tool is not None
        try:
            future.result(timeout=max(0.1, min(tool.timeout_s, budget.deadline - time.monotonic())))
        except FutureTimeout:
            # MuJoCo work cannot be interrupted, so the late result is thrown away.
            item.result = _rejected(scope, tool, "The tool took too long and was stopped", "too_long")


def _segments(planned: list[_Planned]) -> list[list[_Planned]]:
    """Runs of reads that may overlap, and each write alone, in the order the model asked."""
    pending = [item for item in planned if item.result is None]
    segments: list[list[_Planned]] = []
    for item in pending:
        if item.effect == "read" and segments and segments[-1][0].effect == "read":
            segments[-1].append(item)
        else:
            segments.append([item])
    return segments


def _trains_after_applies(planned: list[_Planned]) -> list[_Planned]:
    """Training starts after any apply of the same step, so it trains the new revision."""
    if not any(item.call.name == "apply" for item in planned):
        return planned
    return sorted(planned, key=lambda item: item.call.name == "train")


def execute_batch(scope: TurnScope, calls: list[ToolCall], budget: TurnBudget, off: frozenset[str] | None) -> _Batch:
    """Run one step's calls; `off` names the only tools still allowed once a limit forced the answer."""
    others = [call for call in calls if call.name != ANSWER_TOOL]
    planned = _trains_after_applies([_plan(scope, call, budget, off, i) for i, call in enumerate(others)])
    for segment in _segments(planned):
        if len(segment) > 1 or segment[0].effect == "read":
            _run_parallel(scope, segment, budget)
        else:
            _run(scope, segment[0], budget)
    by_id = {item.call.id: item for item in planned}
    ordered = [by_id[call.id] for call in others if call.id in by_id]
    limits = budget.limits
    texts = []
    for item in ordered:
        result = item.result or Observation("The tool was not run.", ok=False)
        limit = item.tool.observation_chars if item.tool else 2_000
        hint = HINTS.get(item.call.name, "Ask more narrowly for the rest.")
        texts.append(truncate(result.text, limit, hint))
    texts = fit_step(texts, limits.step_observation_chars)
    batch = _Batch(messages=[], images=[])
    shown = {item.call.id: text for item, text in zip(ordered, texts, strict=True)}
    batch.messages = [
        {"role": "tool", "tool_call_id": item.call.id, "content": shown[item.call.id]} for item in ordered
    ]
    # Steps, sources and pictures follow the order the tools ran in, which is what the person sees.
    for item in planned:
        result = item.result or Observation("The tool was not run.", ok=False)
        if result.ok:
            scope.sources.append(shown[item.call.id])
            if result.run_facts:
                scope.percent_sources.append(shown[item.call.id])
        batch.summaries[item.call.id] = result.summary
        if item.tool is not None:
            summary = result.summary or step_said("used", scope.language, tool=item.tool.name)
            scope.steps.append(AgentStep(tool=item.tool.step, summary=summary[:200], ok=result.ok))
        if result.image is not None and scope.can_see:
            batch.images.append((result.image_label or item.call.name, result.image))
    answers = [call for call in calls if call.name == ANSWER_TOOL]
    for extra in answers[:-1]:
        batch.messages.append(
            {"role": "tool", "tool_call_id": extra.id, "content": "Only the last answer call counts."}
        )
    if answers:
        batch.answer_call = answers[-1]
        batch.final, problem = _final(answers[-1])
        if problem:
            batch.messages.append({"role": "tool", "tool_call_id": answers[-1].id, "content": problem})
    return batch


def _final(call: ToolCall) -> tuple[FinalAnswer | None, str | None]:
    try:
        return FinalAnswer.model_validate_json(call.arguments or "{}"), None
    except ValidationError as error:
        listed = "\n".join(f"- {problem}" for problem in schema_problems(error))
        return None, f"The answer does not fit:\n{listed}\nCall answer again."


def image_bridge(images: list[tuple[str, bytes]], first: int) -> dict:
    lines = "; ".join(f"{first + index} = {label}" for index, (label, _) in enumerate(images))
    parts: list[dict] = [{"type": "text", "text": f"{PICTURES_NOTE}{lines}"}]
    for _, png in images:
        parts.append(
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{base64.b64encode(png).decode()}"}}
        )
    return {"role": "user", "content": parts}


def engine_answer(scope: TurnScope, reason: str) -> FinalAnswer:
    """The answer the engine writes itself when the model could not finish one, in the person's language."""
    parts = [say("stopped", scope.language, reason=reason), *scope.side_effects]
    if scope.proposal is not None:
        parts.append(say("proposal_kept", scope.language))
    return FinalAnswer(answer=" ".join(parts))


def _limit(budget: TurnBudget, scope: TurnScope) -> str | None:
    return budget.wrap_up_reason(scope.language)


def merged_steps(steps: list[AgentStep]) -> list[AgentStep]:
    """Consecutive identical steps shown once with how many times they happened, at most STEP_LIMIT."""
    merged: list[tuple[AgentStep, int]] = []
    for step in steps:
        if merged and merged[-1][0] == step:
            merged[-1] = (step, merged[-1][1] + 1)
        else:
            merged.append((step, 1))
    shown = [
        step if count == 1 else step.model_copy(update={"summary": f"{step.summary} ({count}×)"[:200]})
        for step, count in merged
    ]
    return shown[:STEP_LIMIT]


def settled(scope: TurnScope, final: FinalAnswer) -> FinalAnswer:
    return final if not answer.check(scope, final) else answer.degraded(scope, final)


def run_loop(
    client: ModelClient,
    scope: TurnScope,
    messages: list[dict],
    limits: AgentLimits,
    window: int,
    on_overflow: Callable[[int], None] = lambda tokens: None,
) -> LoopOutcome:
    budget = TurnBudget(limits, window)
    tools = definitions()
    transcript = list(messages)
    outcome = LoopOutcome(None)
    summaries: dict[str, str] = {}
    failures, pictures, noted = 0, 0, False
    # A last step that only proposed gets one more call, forced to answer, so its summary is not lost.
    late_proposal = False
    # A turn that ends in plain text is restated once through answer, which carries suggestions and buttons.
    spoken: FinalAnswer | None = None
    restating = False
    while True:
        retire_pictures(transcript, limits.images_kept)
        top = ceiling(budget.window, limits)
        if estimate(transcript, tools, budget.measured, budget.measured_messages) > limits.prune_ratio * top:
            prune_observations(transcript, summaries)
            budget.measured = None
            if estimate(transcript, tools) > top:
                budget.force("too_long")
        reason = budget.wrap_up_reason()
        # A change that passed its try but is not proposed yet may still be proposed in the last step.
        pending = reason is not None and scope.proposal is None and not scope.applied and not late_proposal
        pending = pending and any(tried.passed for tried in scope.tries.values())
        if reason and not noted:
            transcript.append(note(WRAP_UP.format(reason=reason) + (PROPOSE_STILL if pending else "")))
            noted = True
        sent = len(transcript)
        choice = ("required" if pending else ANSWER_TOOL) if reason or restating else "auto"
        try:
            turn = client.step(transcript, tools, choice, budget.deadline)
        except ContextOverflow:
            if budget.overflow_recovered:
                outcome.failure = NO_ROOM
                return outcome
            budget.overflow_recovered = True
            learned = int(0.8 * estimate(transcript, tools))
            budget.window = min(budget.window, learned)
            on_overflow(learned)
            prune_observations(transcript, summaries, aggressive=True)
            budget.measured = None
            continue
        except InputRejected as error:
            if scope.can_see and strip_pictures(transcript):
                scope.can_see = False
                continue
            if budget.model_calls == 0:
                raise
            outcome.final = settled(scope, spoken) if spoken else None
            outcome.failure = str(error)
            return outcome
        except CopilotError as error:
            if budget.model_calls == 0:
                raise
            outcome.final = settled(scope, spoken) if spoken else None
            outcome.failure = str(error)
            return outcome
        budget.record_model_call(turn.usage, sent)
        if turn.thinking:
            outcome.thinking.append(turn.thinking)
        transcript.append(turn.raw)
        was_restating, restating = restating, False
        if not turn.tool_calls:
            if turn.text and spoken is None and not reason and not was_restating:
                spoken, restating = FinalAnswer(answer=turn.text[:4000]), True
                transcript.append(note(RESTATE))
                continue
            if turn.text:
                final = FinalAnswer(answer=turn.text[:4000])
                problems = answer.check(scope, final)
                if not problems:
                    outcome.final = final
                    return outcome
                failures += 1
                if failures > 1 or reason:
                    outcome.final = answer.degraded(scope, final)
                    return outcome
                transcript.append(note(ANSWER_REJECTED.format(problems="\n".join(problems))))
                continue
            if reason or budget.nudged_empty:
                outcome.final = engine_answer(scope, _limit(budget, scope) or say("empty", scope.language))
                return outcome
            budget.nudged_empty = True
            transcript.append(note(EMPTY_NUDGE))
            continue
        off = (frozenset({"propose"}) if pending else frozenset()) if reason else None
        batch = execute_batch(scope, turn.tool_calls, budget, off)
        summaries |= batch.summaries
        transcript.extend(batch.messages)
        if batch.answer_call is not None and batch.final is not None:
            problems = answer.check(scope, batch.final)
            if not problems:
                outcome.final = batch.final
                return outcome
            failures += 1
            if failures > 1 or reason:
                outcome.final = answer.degraded(scope, batch.final)
                return outcome
            listed = "\n".join(f"- {problem}" for problem in problems)
            transcript.append(
                {
                    "role": "tool",
                    "tool_call_id": batch.answer_call.id,
                    "content": f"Your answer was rejected:\n{listed}\nFix it and call answer again.",
                }
            )
        elif batch.answer_call is not None:
            failures += 1
        if batch.images:
            transcript.append(image_bridge(batch.images, pictures + 1))
            pictures += len(batch.images)
        if reason and pending and not late_proposal:
            late_proposal = True
            continue
        if reason:
            outcome.final = engine_answer(scope, _limit(budget, scope) or reason)
            return outcome
        if failures > 1:
            outcome.final = engine_answer(scope, say("format_twice", scope.language))
            return outcome
