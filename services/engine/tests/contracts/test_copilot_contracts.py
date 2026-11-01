import pytest
from pydantic import ValidationError

from icarus.contracts.copilot import CopilotProposal, ModelSettingsPatch, SendMessage


def test_a_proposal_carries_at_least_one_validated_operation() -> None:
    proposal = CopilotProposal.model_validate(
        {
            "id": "p1",
            "project_id": "abc",
            "base_revision": 3,
            "summary": "Make it night",
            "explanation": "Dim the sun so the car drives at night.",
            "operations": [
                {
                    "op": "set_property",
                    "object": "sun",
                    "component": "light",
                    "property": "intensity",
                    "value": {"type": "slider", "value": 0.1},
                }
            ],
            "changes": [{"label": "Sun brightness", "before": "1", "after": "0.1"}],
            "warnings": [],
            "status": "open",
        }
    )
    assert proposal.operations[0].op == "set_property"
    with pytest.raises(ValidationError):
        CopilotProposal.model_validate({**proposal.model_dump(), "operations": []})


def test_messages_and_settings_refuse_unknown_fields_and_empty_text() -> None:
    with pytest.raises(ValidationError):
        SendMessage(text="")
    with pytest.raises(ValidationError):
        ModelSettingsPatch.model_validate({"models": {"telepathy": "x"}})
