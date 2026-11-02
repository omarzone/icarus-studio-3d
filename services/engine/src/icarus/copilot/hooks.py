"""Fixed points of the copilot's life where engine code and declarative data can add, block or ask."""

import json
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from icarus.contracts.events import HookAction, HookDecisionEvent, HookPoint

REASON_LIMIT = 400

type DeclarativeAction = Literal["add_context", "block", "require_approval", "suggest", "run_check"]
type FailAction = Literal["block", "require_approval", "add_context", "suggest"]
type ConditionOp = Literal["equals", "not_equals", "contains", "greater_than", "less_than", "exists"]
type ConditionValue = str | float | bool | None


@dataclass(frozen=True)
class HookContext:
    """What a hook sees: the point, the tool and its arguments when there is one, and event fields."""

    point: HookPoint
    tool: str | None = None
    args: Mapping[str, object] = field(default_factory=dict)
    fields: Mapping[str, object] = field(default_factory=dict)

    def lookup(self, path: str) -> tuple[bool, object]:
        current: object = {"tool": self.tool, "args": self.args, **self.fields}
        for key in path.split("."):
            if not isinstance(current, Mapping) or key not in current:
                return False, None
            current = current[key]
        return True, current


class HookDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    point: HookPoint
    action: HookAction
    reason: str
    source: str

    def to_event(self) -> HookDecisionEvent:
        return HookDecisionEvent(
            type="hook_decision", point=self.point, action=self.action, reason=self.reason[:REASON_LIMIT]
        )


type EngineHook = Callable[[HookContext], HookDecision | None]
type EngineCheck = Callable[[HookContext], str | None]


class HookCondition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field: str = Field(min_length=1, max_length=120)
    op: ConditionOp = "equals"
    value: ConditionValue = None

    def holds(self, context: HookContext) -> bool:
        found, actual = context.lookup(self.field)
        if self.op == "exists":
            return found
        if not found:
            return False
        return _compare(self.op, actual, self.value)


def _compare(op: ConditionOp, actual: object, expected: ConditionValue) -> bool:
    match op:
        case "equals":
            return actual == expected
        case "not_equals":
            return actual != expected
        case "contains":
            if isinstance(actual, str):
                return isinstance(expected, str) and expected in actual
            if isinstance(actual, list | tuple | set | frozenset):
                return expected in actual
            return False
        case "greater_than" | "less_than":
            if isinstance(actual, bool) or isinstance(expected, bool):
                return False
            if not isinstance(actual, int | float) or not isinstance(expected, int | float):
                return False
            return actual > expected if op == "greater_than" else actual < expected
        case "exists":
            return True


class HookMatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tool: str | None = Field(default=None, max_length=80)
    conditions: list[HookCondition] = Field(default_factory=list, max_length=12)

    def matches(self, context: HookContext) -> bool:
        if self.tool is not None and self.tool != context.tool:
            return False
        return all(condition.holds(context) for condition in self.conditions)


class HookParams(BaseModel):
    model_config = ConfigDict(extra="forbid")

    check: str | None = Field(default=None, max_length=80)
    on_fail: FailAction = "block"
    skill: str | None = Field(default=None, max_length=80)


class DeclarativeHook(BaseModel):
    """A hook carried as data: it matches an event and picks one of a fixed set of actions, never code."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=80)
    point: HookPoint
    match: HookMatch = Field(default_factory=HookMatch)
    action: DeclarativeAction
    reason: str = Field(default="", max_length=REASON_LIMIT)
    params: HookParams = Field(default_factory=HookParams)

    @model_validator(mode="after")
    def _check_named(self) -> "DeclarativeHook":
        if self.action == "run_check" and not self.params.check:
            raise ValueError("run_check needs params.check")
        return self


@dataclass(frozen=True)
class HookFailure:
    hook: str
    point: HookPoint
    error: str


@dataclass
class HookOutcome:
    decisions: list[HookDecision] = field(default_factory=list)
    failures: list[HookFailure] = field(default_factory=list)

    def _reasons(self, action: HookAction) -> list[str]:
        return [decision.reason for decision in self.decisions if decision.action == action]

    @property
    def blocked(self) -> bool:
        return any(decision.action == "block" for decision in self.decisions)

    @property
    def block_reason(self) -> str:
        return next(iter(self._reasons("block")), "")

    @property
    def needs_approval(self) -> bool:
        return not self.blocked and any(decision.action == "require_approval" for decision in self.decisions)

    @property
    def context_notes(self) -> list[str]:
        return self._reasons("add_context")

    @property
    def suggestions(self) -> list[str]:
        return self._reasons("suggest")

    def events(self) -> list[HookDecisionEvent]:
        return [decision.to_event() for decision in self.decisions]


@dataclass(frozen=True)
class _Registered:
    name: str
    order: int
    hook: EngineHook


class HookRegistry:
    """Runs engine hooks by order, then declarative hooks in install order; a failing hook is skipped."""

    def __init__(self) -> None:
        self._engine: dict[HookPoint, list[_Registered]] = {}
        self._declarative: list[DeclarativeHook] = []
        self._checks: dict[str, EngineCheck] = {}

    def register(self, point: HookPoint, hook: EngineHook, *, name: str, order: int = 100) -> None:
        hooks = [*self._engine.get(point, []), _Registered(name=name, order=order, hook=hook)]
        self._engine[point] = sorted(hooks, key=lambda item: item.order)

    def register_check(self, name: str, check: EngineCheck) -> None:
        self._checks[name] = check

    def add_declarative(self, hook: DeclarativeHook) -> None:
        if hook.params.check is not None and hook.params.check not in self._checks:
            raise ValueError(f"Hook {hook.id} names an unknown check: {hook.params.check}")
        self._declarative.append(hook)

    def run(self, context: HookContext) -> HookOutcome:
        outcome = HookOutcome()
        for registered in self._engine.get(context.point, []):
            self._guarded(outcome, registered.name, context, lambda hook=registered.hook: hook(context))
        for declared in self._declarative:
            if declared.point == context.point and declared.match.matches(context):
                self._guarded(outcome, declared.id, context, lambda hook=declared: self._declared(hook, context))
        return outcome

    def _guarded(
        self, outcome: HookOutcome, name: str, context: HookContext, call: Callable[[], HookDecision | None]
    ) -> None:
        try:
            decision = call()
        except Exception as error:  # noqa: BLE001 - one broken hook must never end the turn
            outcome.failures.append(
                HookFailure(hook=name, point=context.point, error=f"{type(error).__name__}: {error}")
            )
            return
        if decision is not None:
            outcome.decisions.append(decision)

    def _declared(self, hook: DeclarativeHook, context: HookContext) -> HookDecision:
        if hook.action != "run_check":
            return HookDecision(point=context.point, action=hook.action, reason=hook.reason, source=hook.id)
        name = hook.params.check or ""
        problem = self._checks[name](context)
        if problem is None:
            return HookDecision(point=context.point, action="run_check", reason=f"Check {name} passed", source=hook.id)
        return HookDecision(point=context.point, action=hook.params.on_fail, reason=problem, source=hook.id)


def load_declarative_hooks(
    source: Path | Iterable[Mapping[str, object]], *, tools: Iterable[str] | None = None
) -> list[DeclarativeHook]:
    """Validate hooks from a JSON file or already-parsed data; unknown tool names are rejected."""
    raw: object = json.loads(source.read_text(encoding="utf-8")) if isinstance(source, Path) else list(source)
    if not isinstance(raw, list):
        raise ValueError("A hooks file holds a list of hooks")
    hooks = [DeclarativeHook.model_validate(item) for item in raw]
    known = set(tools) if tools is not None else None
    for hook in hooks:
        if known is not None and hook.match.tool is not None and hook.match.tool not in known:
            raise ValueError(f"Hook {hook.id} names an unknown tool: {hook.match.tool}")
    return hooks
