import json
import os
import time
from typing import Annotated, Literal

import httpx
import pytest
from pydantic import BaseModel, ConfigDict, Field

from icarus.copilot.architect import IdeaDrafts
from icarus.copilot.chat import ChatReply
from icarus.copilot.client import Connection, CopilotError, ModelClient, NotConnected, copilot_client
from icarus.copilot.response_schema import response_schema
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
    assert body["messages"][1] == {"role": "user", "content": "Is it good?"}
    assert body["messages"][0]["content"].startswith("You judge.")
    assert body["response_format"] == {
        "type": "json_schema",
        "json_schema": {"name": "verdict", "schema": response_schema(Verdict)[0], "strict": True},
    }


def test_the_schema_is_also_written_in_the_instructions_for_services_that_do_not_enforce_it():
    client, requests = scripted([{"content": '{"answer": "yes", "score": 3}'}])
    client.ask("verdict", Verdict, "You judge.", "Is it good?")
    system = requests[0]["body"]["messages"][0]["content"]
    assert json.dumps(Verdict.model_json_schema()) in system


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
    reply = client.ask("chat_reply", ChatReply, "You are a helpful copilot. Answer in JSON.", "Is the sky blue?")
    assert reply.value.answer and len(reply.value.suggestions) <= 3


class Shape(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["box"]
    size: tuple[float, float, float]


class Ball(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["ball"]
    radius: float = Field(gt=0, le=5)


class Scene(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=40)
    note: str | None = None
    items: list[Annotated[Shape | Ball, Field(discriminator="kind")]] = Field(max_length=3)


FORBIDDEN_IN_STRICT = {"oneOf", "discriminator", "default", "minLength", "maxLength", "prefixItems", "const", "title"}


def strict_problems(node: object, path: str = "$") -> list[str]:
    """What OpenAI strict mode would reject in a schema, ignoring objects that are open maps."""
    problems: list[str] = []
    if isinstance(node, list):
        for index, item in enumerate(node):
            problems += strict_problems(item, f"{path}[{index}]")
        return problems
    if not isinstance(node, dict):
        return problems
    problems += [f"{path}: {key}" for key in sorted(FORBIDDEN_IN_STRICT & node.keys())]
    if node.get("type") == "object" and not isinstance(node.get("additionalProperties"), dict):
        properties = node.get("properties", {})
        if node.get("additionalProperties") is not False:
            problems.append(f"{path}: additionalProperties is not false")
        if set(node.get("required", [])) != set(properties):
            problems.append(f"{path}: not every property is required")
    for key, value in node.items():
        if key in ("properties", "$defs"):
            for name, sub in value.items():
                problems += strict_problems(sub, f"{path}.{key}.{name}")
        elif key not in ("enum", "required"):
            problems += strict_problems(value, f"{path}.{key}")
    return problems


def open_maps(node: object) -> int:
    if isinstance(node, list):
        return sum(open_maps(item) for item in node)
    if not isinstance(node, dict):
        return 0
    own = 1 if isinstance(node.get("additionalProperties"), dict) else 0
    return own + sum(open_maps(value) for key, value in node.items() if key != "enum")


def test_a_closed_schema_is_sent_in_strict_form_and_still_validated_by_pydantic():
    schema, strict = response_schema(Scene)
    assert strict and strict_problems(schema) == [] and open_maps(schema) == 0
    assert {"type": "null"} in schema["properties"]["note"]["anyOf"] and "note" in schema["required"]
    client, requests = scripted([{"content": '{"name": "", "note": null, "items": []}'}])
    with pytest.raises(CopilotError):
        client.ask("scene", Scene, "s", "u")
    assert requests[0]["body"]["response_format"]["json_schema"]["strict"] is True


@pytest.mark.parametrize("output", [ChatReply, IdeaDrafts])
def test_copilot_schemas_follow_strict_rules_except_their_open_maps(output):
    schema, strict = response_schema(output)
    assert strict_problems(schema) == []
    # Component properties and reward parameters are maps, which strict mode cannot express.
    assert open_maps(schema) > 0 and not strict


def test_a_refused_schema_falls_back_to_json_mode_with_the_schema_in_the_prompt():
    requests: list[dict] = []

    def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        requests.append(body)
        if body["response_format"]["type"] == "json_schema":
            return httpx.Response(400, json={"error": {"message": "Invalid schema for response_format 'verdict'"}})
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"answer": "yes", "score": 3}'}}]})

    client = ModelClient(Connection("https://models.example/v1", KEY, "big-model"), httpx.MockTransport(handle))
    assert client.ask("verdict", Verdict, "You judge.", "Is it good?").value.score == 3
    assert [body["response_format"]["type"] for body in requests] == ["json_schema", "json_object"]
    system = requests[1]["messages"][0]
    assert system["role"] == "system" and system["content"].startswith("You judge.") and '"score"' in system["content"]


def test_an_unrelated_bad_request_is_not_retried():
    requests: list[dict] = []

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(json.loads(request.content))
        return httpx.Response(400, json={"error": {"message": "Unknown model big-model"}})

    client = ModelClient(Connection("https://models.example/v1", KEY, "big-model"), httpx.MockTransport(handle))
    with pytest.raises(CopilotError) as error:
        client.ask("verdict", Verdict, "s", "u")
    assert len(requests) == 1 and "400" in str(error.value)


def test_ping_sends_no_token_limit_and_accepts_an_empty_answer():
    for content in (None, ""):
        client, requests = scripted([{"content": content}])
        client.ping()
        assert "max_tokens" not in requests[0]["body"]


def test_a_slow_model_is_reported_as_a_timeout():
    def slow(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("timed out", request=request)

    client = ModelClient(Connection("https://models.example/v1", KEY, "big-model"), httpx.MockTransport(slow))
    with pytest.raises(CopilotError) as error:
        client.ask("verdict", Verdict, "s", "u")
    assert str(error.value) == "The model took longer than 60 s to answer"


def test_reasoning_fields_and_unclosed_think_tags_are_split_from_the_answer():
    named, _ = scripted([{"content": '{"answer": "yes", "score": 2}', "reasoning": "Looked closely."}])
    assert named.ask("verdict", Verdict, "s", "u").thinking == "Looked closely."
    opened_in_prompt, _ = scripted([{"content": 'Weigh it.</think>{"answer": "yes", "score": 2}'}])
    reply = opened_in_prompt.ask("verdict", Verdict, "s", "u")
    assert reply.thinking == "Weigh it." and reply.value.score == 2
    cut_off, _ = scripted([{"content": '{"answer": "no", "score": 1}<think>Still going'}])
    reply = cut_off.ask("verdict", Verdict, "s", "u")
    assert reply.thinking == "Still going" and reply.value.score == 1


def test_a_long_answer_may_be_given_more_time_than_the_default_but_never_past_the_deadline():
    waits: list[float] = []

    def handle(request: httpx.Request) -> httpx.Response:
        waits.append(request.extensions["timeout"]["read"])
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"answer": "ok", "score": 1}'}}]})

    client = ModelClient(Connection("https://models.example/v1", KEY, "big-model"), httpx.MockTransport(handle))
    client.ask("verdict", Verdict, "Judge.", "Go", timeout=90)
    client.ask("verdict", Verdict, "Judge.", "Go", timeout=90, deadline=time.monotonic() + 30)
    assert waits[0] == 90 and 29 < waits[1] <= 30
