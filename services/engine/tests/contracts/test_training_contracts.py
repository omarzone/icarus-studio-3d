import pytest
from pydantic import ValidationError

from icarus.contracts.training import MetricEvent, RunEventEnvelope, StartRun


def test_start_run_bounds_steps_and_copies() -> None:
    assert StartRun(total_steps=1_000_000, copies=16).seed is None
    with pytest.raises(ValidationError):
        StartRun(total_steps=1_000_000, copies=0)
    with pytest.raises(ValidationError):
        StartRun(total_steps=100, copies=16)


def test_run_events_are_told_apart_by_type() -> None:
    envelope = RunEventEnvelope.model_validate(
        {
            "event": {
                "type": "metric",
                "metric": {
                    "kind": "eval",
                    "step": 100_000,
                    "elapsed": 80.0,
                    "episode_return": 4.2,
                    "episode_length": 310.0,
                    "success_rate": 0.4,
                    "reward_terms": {"progress_to_goal": 3.1},
                },
            }
        }
    )
    assert isinstance(envelope.event, MetricEvent)
    with pytest.raises(ValidationError):
        RunEventEnvelope.model_validate({"event": {"type": "metric", "metric": {"kind": "eval", "step": 1}}})
