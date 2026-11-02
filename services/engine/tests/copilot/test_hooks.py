import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from icarus.contracts.events import HookDecisionEvent
from icarus.copilot.hooks import (
    DeclarativeHook,
    HookContext,
    HookDecision,
    HookRegistry,
    load_declarative_hooks,
)


def _removes_reward() -> DeclarativeHook:
    return DeclarativeHook.model_validate(
        {
            "id": "guard-rewards",
            "point": "before_apply",
            "match": {"conditions": [{"field": "change.removes", "op": "contains", "value": "reward"}]},
            "action": "require_approval",
            "reason": "Removing a reward term needs your approval.",
        }
    )


def test_engine_hooks_run_by_order_before_declarative_ones() -> None:
    registry = HookRegistry()
    seen: list[str] = []

    def late(context: HookContext) -> HookDecision | None:
        seen.append("late")
        return None

    def early(context: HookContext) -> HookDecision | None:
        seen.append("early")
        return HookDecision(point=context.point, action="add_context", reason="Engine note", source="early")

    registry.register("turn_start", late, name="late", order=20)
    registry.register("turn_start", early, name="early", order=10)
    registry.add_declarative(
        DeclarativeHook.model_validate(
            {"id": "note", "point": "turn_start", "action": "add_context", "reason": "Data note"}
        )
    )

    outcome = registry.run(HookContext(point="turn_start"))

    assert seen == ["early", "late"]
    assert [decision.source for decision in outcome.decisions] == ["early", "note"]
    assert outcome.context_notes == ["Engine note", "Data note"]
    assert not outcome.blocked


def test_block_wins_over_other_decisions_and_failures_are_skipped() -> None:
    registry = HookRegistry()

    def broken(context: HookContext) -> HookDecision | None:
        raise RuntimeError("boom")

    def blocker(context: HookContext) -> HookDecision | None:
        return HookDecision(point=context.point, action="block", reason="Not now", source="blocker")

    registry.register("before_tool", broken, name="broken")
    registry.register("before_tool", blocker, name="blocker", order=5)
    registry.add_declarative(
        DeclarativeHook.model_validate(
            {"id": "ok", "point": "before_tool", "action": "suggest", "reason": "Try a slope"}
        )
    )

    outcome = registry.run(HookContext(point="before_tool", tool="train"))

    assert outcome.blocked
    assert outcome.block_reason == "Not now"
    assert outcome.suggestions == ["Try a slope"]
    assert [failure.hook for failure in outcome.failures] == ["broken"]
    assert "boom" in outcome.failures[0].error


def test_declarative_match_uses_tool_and_conditions_over_event_fields() -> None:
    registry = HookRegistry()
    registry.add_declarative(_removes_reward())
    registry.add_declarative(
        DeclarativeHook.model_validate(
            {
                "id": "no-long-runs",
                "point": "before_tool",
                "match": {
                    "tool": "train",
                    "conditions": [{"field": "args.steps", "op": "greater_than", "value": 1000}],
                },
                "action": "block",
                "reason": "Keep runs short.",
            }
        )
    )

    removing = registry.run(HookContext(point="before_apply", fields={"change": {"removes": ["reward", "sensor"]}}))
    keeping = registry.run(HookContext(point="before_apply", fields={"change": {"removes": []}}))
    long_run = registry.run(HookContext(point="before_tool", tool="train", args={"steps": 5000}))
    other_tool = registry.run(HookContext(point="before_tool", tool="look", args={"steps": 5000}))
    short_run = registry.run(HookContext(point="before_tool", tool="train", args={"steps": 10}))

    assert removing.needs_approval
    assert not keeping.needs_approval
    assert long_run.blocked
    assert not other_tool.blocked
    assert not short_run.blocked


def test_run_check_reports_pass_and_applies_on_fail_action() -> None:
    registry = HookRegistry()
    registry.register_check("always_fails", lambda context: "Two numbers have no source")
    registry.register_check("always_passes", lambda context: None)
    for check in ("always_fails", "always_passes"):
        registry.add_declarative(
            DeclarativeHook.model_validate(
                {
                    "id": check,
                    "point": "turn_end",
                    "action": "run_check",
                    "params": {"check": check, "on_fail": "require_approval"},
                }
            )
        )

    outcome = registry.run(HookContext(point="turn_end"))

    assert [(decision.source, decision.action) for decision in outcome.decisions] == [
        ("always_fails", "require_approval"),
        ("always_passes", "run_check"),
    ]
    assert outcome.decisions[0].reason == "Two numbers have no source"


def test_unknown_check_is_rejected_when_added() -> None:
    registry = HookRegistry()
    hook = DeclarativeHook.model_validate(
        {"id": "x", "point": "turn_end", "action": "run_check", "params": {"check": "missing"}}
    )
    with pytest.raises(ValueError, match="missing"):
        registry.add_declarative(hook)


def test_declarative_hook_rejects_unknown_points_actions_and_fields() -> None:
    with pytest.raises(ValidationError):
        DeclarativeHook.model_validate({"id": "x", "point": "on_boot", "action": "block"})
    with pytest.raises(ValidationError):
        DeclarativeHook.model_validate({"id": "x", "point": "turn_end", "action": "execute"})
    with pytest.raises(ValidationError):
        DeclarativeHook.model_validate({"id": "x", "point": "turn_end", "action": "block", "script": "rm"})
    with pytest.raises(ValidationError):
        DeclarativeHook.model_validate({"id": "x", "point": "turn_end", "action": "run_check"})


def test_load_declarative_hooks_from_json_file_checks_tool_names(tmp_path: Path) -> None:
    path = tmp_path / "hooks.json"
    path.write_text(
        json.dumps([{"id": "a", "point": "before_tool", "match": {"tool": "train"}, "action": "block"}]),
        encoding="utf-8",
    )

    hooks = load_declarative_hooks(path, tools={"train", "look"})

    assert [hook.id for hook in hooks] == ["a"]
    with pytest.raises(ValueError, match="dance"):
        load_declarative_hooks(
            [{"id": "b", "point": "before_tool", "match": {"tool": "dance"}, "action": "block"}], tools={"train"}
        )


def test_decision_converts_to_contract_event() -> None:
    decision = HookDecision(point="before_apply", action="block", reason="x" * 600, source="guard")

    event = decision.to_event()

    assert isinstance(event, HookDecisionEvent)
    assert event.type == "hook_decision"
    assert event.point == "before_apply"
    assert len(event.reason) == 400
