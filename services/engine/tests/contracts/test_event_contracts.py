import pytest
from pydantic import ValidationError

from icarus.contracts.events import (
    EngineEventEnvelope,
    HookDecisionEvent,
    RunEventWrapper,
    StepEvent,
    TaskFinishedEvent,
    TaskInfo,
)
from icarus.contracts.training import LogEvent

NOW = "2026-11-01T12:00:00Z"


def _envelope(event: dict[str, object]) -> EngineEventEnvelope:
    return EngineEventEnvelope.model_validate({"id": "e1", "time": NOW, "project_id": "p1", "event": event})


def test_engine_events_are_told_apart_by_type() -> None:
    step = _envelope({"type": "step", "turn_id": "t1", "step": {"tool": "look", "summary": "Looked at the car"}})
    assert isinstance(step.event, StepEvent)
    run = _envelope(
        {
            "type": "run_event",
            "run_id": "r1",
            "event": {"type": "log", "line": {"elapsed": 1.0, "level": "info", "text": "ok"}},
        }
    )
    assert isinstance(run.event, RunEventWrapper)
    assert isinstance(run.event.event, LogEvent)
    hook = _envelope({"type": "hook_decision", "point": "before_apply", "action": "require_approval", "reason": "x"})
    assert isinstance(hook.event, HookDecisionEvent)


def test_task_finished_needs_a_final_state() -> None:
    done = _envelope({"type": "task_finished", "task_id": "k1", "state": "failed", "reason": "Engine stopped"})
    assert isinstance(done.event, TaskFinishedEvent)
    with pytest.raises(ValidationError):
        _envelope({"type": "task_finished", "task_id": "k1", "state": "running"})


def test_unknown_kinds_extra_fields_and_out_of_range_progress_are_rejected() -> None:
    with pytest.raises(ValidationError):
        _envelope({"type": "telepathy"})
    with pytest.raises(ValidationError):
        _envelope({"type": "view_taken", "turn_id": "t1", "attachment_id": "a1", "path": "C:/x"})
    with pytest.raises(ValidationError):
        _envelope({"type": "task_progress", "task_id": "k1", "progress": 1.5, "text": "Half"})
    with pytest.raises(ValidationError):
        EngineEventEnvelope.model_validate(
            {"id": "e1", "time": NOW, "project_id": None, "event": {"type": "turn_started", "turn_id": "t"}, "x": 1}
        )


def test_task_info_bounds_kind_and_progress() -> None:
    task = TaskInfo.model_validate(
        {
            "id": "k1",
            "project_id": None,
            "kind": "autopilot",
            "state": "running",
            "progress": None,
            "title": "Autopilot",
            "started_at": NOW,
            "finished_at": None,
            "parent_task_id": None,
        }
    )
    assert task.kind == "autopilot"
    with pytest.raises(ValidationError):
        TaskInfo.model_validate({**task.model_dump(), "kind": "mining"})
    with pytest.raises(ValidationError):
        TaskInfo.model_validate({**task.model_dump(), "progress": float("nan")})
