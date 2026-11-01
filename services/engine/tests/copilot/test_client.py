import json
import os

import httpx
import pytest
from pydantic import BaseModel, ConfigDict

from icarus.copilot.client import Connection, CopilotError, ModelClient, NotConnected, copilot_client
from icarus.copilot.settings import ModelSettingsStore

KEY = "sk-secret-9876543210wxyz"


class Verdict(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answer: str
    score: int


def scripted(replies: list[dict]) -> tuple[ModelClient, list[dict]]:
    """A client whose model answers each request with the next scripted message."""
    requests: list[dict] = []

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(
            {"url": str(request.url), "headers": dict(request.headers), "body": json.loads(request.content)}
        )
        message = replies[min(len(requests) - 1, len(replies) - 1)]
        return httpx.Response(200, json={"choices": [{"message": {"role": "assistant", **message}}]})

    client = ModelClient(Connection("https://models.example/v1", KEY, "big-model"), httpx.MockTransport(handle))
    return client, requests


def test_the_request_is_constrained_by_the_output_schema():
    client, requests = scripted([{"content": '{"answer": "yes", "score": 3}'}])
    reply = client.ask("verdict", Verdict, "You judge.", "Is it good?")
    assert reply.value == Verdict(answer="yes", score=3) and reply.problems == []
    request = requests[0]
    assert request["url"] == "https://models.example/v1/chat/completions"
    assert request["headers"]["authorization"] == f"Bearer {KEY}"
    body = request["body"]
    assert body["model"] == "big-model"
    assert body["messages"] == [{"role": "system", "content": "You judge."}, {"role": "user", "content": "Is it good?"}]
    assert body["response_format"] == {
        "type": "json_schema",
        "json_schema": {"name": "verdict", "schema": Verdict.model_json_schema(), "strict": True},
    }


def test_invalid_output_is_retried_once_with_the_error():
    client, requests = scripted([{"content": '{"answer": "yes"}'}, {"content": '{"answer": "yes", "score": 4}'}])
    assert client.ask("verdict", Verdict, "You judge.", "Is it good?").value.score == 4
    retry = requests[1]["body"]["messages"]
    assert retry[2] == {"role": "assistant", "content": '{"answer": "yes"}'}
    assert retry[3]["role"] == "user" and "score" in retry[3]["content"]


def test_two_invalid_outputs_raise_a_readable_error():
    client, requests = scripted([{"content": "not json at all"}])
    with pytest.raises(CopilotError) as error:
        client.ask("verdict", Verdict, "You judge.", "Is it good?")
    assert len(requests) == 2
    assert "twice" in str(error.value) and KEY not in str(error.value)


def test_a_failed_check_is_retried_and_its_problems_returned_when_they_remain():
    client, requests = scripted([{"content": '{"answer": "no", "score": 1}'}])
    reply = client.ask("verdict", Verdict, "You judge.", "Is it good?", check=lambda v: ["Score too low"])
    assert len(requests) == 2 and "Score too low" in requests[1]["body"]["messages"][3]["content"]
    assert reply.value.score == 1 and reply.problems == ["Score too low"]


def test_reasoning_is_split_from_the_answer():
    tagged, _ = scripted([{"content": '<think>Weigh it up.</think>\n{"answer": "yes", "score": 2}'}])
    assert tagged.ask("verdict", Verdict, "s", "u").thinking == "Weigh it up."
    separate, _ = scripted([{"content": '{"answer": "yes", "score": 2}', "reasoning_content": "Checked twice."}])
    reply = separate.ask("verdict", Verdict, "s", "u")
    assert reply.thinking == "Checked twice." and reply.value.answer == "yes"


def test_a_service_error_is_readable_and_hides_the_key():
    def refuse(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": {"message": f"bad key {KEY}"}})

    client = ModelClient(Connection("https://models.example/v1", KEY, "big-model"), httpx.MockTransport(refuse))
    with pytest.raises(CopilotError) as error:
        client.ask("verdict", Verdict, "s", "u")
    assert "401" in str(error.value) and KEY not in str(error.value)


def test_without_a_connection_the_copilot_is_not_connected(tmp_path, monkeypatch):
    monkeypatch.setenv("ICARUS_COPILOT_PROVIDER", "")
    with pytest.raises(NotConnected) as error:
        copilot_client(ModelSettingsStore(tmp_path))
    assert "Settings › AI models" in str(error.value)


@pytest.mark.live
def test_the_configured_endpoint_answers_a_structured_request():
    endpoint, model = os.environ.get("ICARUS_MODEL_ENDPOINT"), os.environ.get("ICARUS_MODEL_REASONING")
    if not endpoint or not model:
        pytest.skip("ICARUS_MODEL_ENDPOINT and ICARUS_MODEL_REASONING are not set")
    client = ModelClient(Connection(endpoint, os.environ.get("ICARUS_MODEL_API_KEY", ""), model))
    reply = client.ask("verdict", Verdict, "Answer in JSON.", "Is the sky blue? Score it from 1 to 5.")
    assert reply.value.answer and 1 <= reply.value.score <= 5
