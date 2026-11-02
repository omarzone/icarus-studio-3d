from icarus.copilot.agent.permissions import APPLY_DENIED, TRAIN_OFFERED
from icarus.copilot.builtin_hooks import default_registry
from icarus.copilot.hooks import DeclarativeHook, HookContext


def test_ask_mode_blocks_the_copilot_applying_but_not_the_person() -> None:
    registry = default_registry()

    copilot = registry.run(HookContext(point="before_apply", fields={"autonomy": "ask", "actor": "copilot"}))
    person = registry.run(HookContext(point="before_apply", fields={"autonomy": "ask", "actor": "user"}))
    autopilot = registry.run(HookContext(point="before_apply", fields={"autonomy": "autopilot", "actor": "copilot"}))

    assert copilot.blocked
    assert copilot.block_reason == APPLY_DENIED
    assert not person.blocked
    assert not autopilot.blocked


def test_ask_mode_tool_rule_matches_the_permission_table() -> None:
    registry = default_registry()

    def run(tool: str, args: dict[str, object], autonomy: str = "ask"):
        return registry.run(HookContext(point="before_tool", tool=tool, args=args, fields={"autonomy": autonomy}))

    assert run("apply", {}).block_reason == APPLY_DENIED
    assert run("train", {"action": "start"}).suggestions == [TRAIN_OFFERED]
    assert run("train", {"action": "start", "continue_from_best": True}).decisions == []
    assert run("apply", {}, autonomy="autopilot").decisions == []
    assert run("look", {}).decisions == []


def test_grounding_check_names_unsupported_numbers() -> None:
    registry = default_registry()
    registry.add_declarative(
        DeclarativeHook.model_validate(
            {"id": "grounded", "point": "turn_end", "action": "run_check", "params": {"check": "grounding"}}
        )
    )

    unsupported = registry.run(
        HookContext(point="turn_end", fields={"answer": "Reward reached 812.5", "sources": ["reward 40.0"]})
    )
    supported = registry.run(
        HookContext(point="turn_end", fields={"answer": "Reward reached 40.0", "sources": ["reward 40.0"]})
    )

    assert unsupported.blocked
    assert "812.5" in unsupported.block_reason
    assert [decision.action for decision in supported.decisions] == ["run_check"]
