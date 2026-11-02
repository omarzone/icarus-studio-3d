import json
import os
import time
from typing import Annotated, Literal

import httpx
import pytest
from pydantic import BaseModel, ConfigDict, Field

from icarus.copilot.architect import IdeaDrafts
from icarus.copilot.client import (
    Connection,
    ContextOverflow,
    CopilotError,
    ModelClient,
    NotConnected,
    ToolsRefused,
    copilot_client,
)
from icarus.copilot.response_schema import response_schema
from icarus.copilot.settings import ModelSettingsStore
from icarus.copilot.single_shot import ChatReply

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
    # The monotonic clock is coarse on Windows, so the remaining time can read a hair over 30 s.
    assert waits[0] == 90 and 29 < waits[1] <= 30.05


TOOLS = [{"type": "function", "function": {"name": "look", "description": "Look.", "parameters": {"type": "object"}}}]


def answering(handler) -> tuple[ModelClient, list[dict]]:
    """A client whose model service is one function of the request body."""
    bodies: list[dict] = []

    def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        bodies.append(body)
        return handler(body, len(bodies))

    return ModelClient(Connection("https://models.example/v1", KEY, "big-model"), httpx.MockTransport(handle)), bodies


def tool_reply(**message) -> httpx.Response:
    choice = {"message": {"role": "assistant", **message}, "finish_reason": "tool_calls"}
    return httpx.Response(200, json={"choices": [choice], "usage": {"prompt_tokens": 120, "completion_tokens": 9}})


def test_a_step_sends_the_tools_and_returns_raw_tool_calls_and_usage():
    call = {"id": "c1", "type": "function", "function": {"name": "look", "arguments": '{"view": "top"'}}
    client, bodies = answering(
        lambda body, n: tool_reply(content="<think>Check first.</think>", tool_calls=[call], reasoning_content="Hm.")
    )
    turn = client.step([{"role": "user", "content": "hi"}], TOOLS)
    assert bodies[0]["tools"] == TOOLS and "tool_choice" not in bodies[0] and "response_format" not in bodies[0]
    assert [(c.id, c.name, c.arguments) for c in turn.tool_calls] == [("c1", "look", '{"view": "top"')]
    assert turn.finish == "tool_calls" and turn.usage is not None and turn.usage.prompt_tokens == 120
    assert turn.thinking == "Hm.\n\nCheck first." and not turn.text
    assert "reasoning_content" not in turn.raw and turn.raw["tool_calls"][0]["id"] == "c1"


def test_a_forced_tool_is_named_and_a_refused_forced_choice_is_retried_with_auto():
    def handle(body: dict, n: int) -> httpx.Response:
        if isinstance(body.get("tool_choice"), dict):
            return httpx.Response(400, json={"error": {"message": "tool_choice object is not supported"}})
        return tool_reply(content="Done.")

    client, bodies = answering(handle)
    turn = client.step([{"role": "user", "content": "hi"}], TOOLS, tool_choice="look")
    assert bodies[0]["tool_choice"] == {"type": "function", "function": {"name": "look"}}
    assert "tool_choice" not in bodies[1] and turn.text == "Done."


def test_a_service_that_refuses_tools_and_a_prompt_too_long_raise_their_own_errors():
    refusing, _ = answering(lambda body, n: httpx.Response(400, json={"error": {"message": "tools are not supported"}}))
    with pytest.raises(ToolsRefused):
        refusing.step([{"role": "user", "content": "hi"}], TOOLS)
    full, _ = answering(
        lambda body, n: httpx.Response(400, json={"error": {"message": "This model's maximum context length is 8192"}})
    )
    with pytest.raises(ContextOverflow):
        full.step([{"role": "user", "content": "hi"}], TOOLS)


def test_a_transient_error_is_retried_once_for_every_role():
    def busy_once(body: dict, n: int) -> httpx.Response:
        if n == 1:
            return httpx.Response(503, headers={"Retry-After": "0"}, json={"error": {"message": "overloaded"}})
        return httpx.Response(200, json={"choices": [{"message": {"content": '{"answer": "ok", "score": 1}'}}]})

    client, bodies = answering(busy_once)
    assert client.ask("verdict", Verdict, "s", "u").value.score == 1 and len(bodies) == 2
    always, bodies = answering(lambda body, n: httpx.Response(429, headers={"Retry-After": "0"}, json={}))
    with pytest.raises(CopilotError) as error:
        always.step([{"role": "user", "content": "hi"}], TOOLS)
    assert len(bodies) == 2 and "429" in str(error.value)


def test_a_timeout_is_retried_once_and_then_reported():
    attempts: list[int] = []

    def slow(request: httpx.Request) -> httpx.Response:
        attempts.append(1)
        raise httpx.ReadTimeout("timed out", request=request)

    client = ModelClient(Connection("https://models.example/v1", KEY, "big-model"), httpx.MockTransport(slow))
    with pytest.raises(CopilotError):
        client.step([{"role": "user", "content": "hi"}], TOOLS)
    assert len(attempts) == 2


def test_a_structured_reply_carries_the_measured_usage():
    client, _ = answering(
        lambda body, n: httpx.Response(
            200,
            json={
                "choices": [{"message": {"content": '{"answer": "ok", "score": 1}'}}],
                "usage": {"prompt_tokens": 50, "completion_tokens": 4},
            },
        )
    )
    usage = client.ask("verdict", Verdict, "s", "u").usage
    assert usage is not None and (usage.prompt_tokens, usage.completion_tokens) == (50, 4)
