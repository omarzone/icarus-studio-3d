import json

import httpx

from icarus.copilot.agent.notes import ENGINE_NOTE
from icarus.copilot.client import Connection, ContextOverflow, ModelClient
from icarus.copilot.fixture_provider import fixture_transport

TOOLS = [{"type": "function", "function": {"name": "look", "parameters": {"type": "object"}}}]


def write(root, name: str, fixture: dict) -> None:
    folder = root / "agent"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{name}.json").write_text(json.dumps(fixture))


def client(root) -> ModelClient:
    return ModelClient(Connection("http://fixtures.invalid/v1", "", "fixtures"), fixture_transport(root))


def test_a_scripted_turn_answers_each_step_of_the_latest_message_in_order(tmp_path):
    write(
        tmp_path,
        "night",
        {
            "match": ["night"],
            "replies": [
                {"tool_calls": [{"name": "look", "arguments": {"view": "top"}}, {"name": "look", "arguments": "{bad"}]},
                {"content": "Done.", "usage": {"prompt_tokens": 900, "completion_tokens": 5}},
            ],
        },
    )
    write(tmp_path, "default", {"replies": [{"content": "Hello."}]})
    model = client(tmp_path)
    history = [{"role": "user", "content": "make it night"}, {"role": "assistant", "content": "Ok."}]
    first = model.step([*history, {"role": "user", "content": "hi"}], TOOLS)
    assert first.text == "Hello."
    turn = [*history[:1], {"role": "user", "content": "night please"}]
    step = model.step(turn, TOOLS)
    assert [(call.id, call.arguments) for call in step.tool_calls] == [
        ("call_0_0", '{"view": "top"}'),
        ("call_0_1", "{bad"),
    ]
    note = {"role": "user", "content": f"{ENGINE_NOTE}keep going"}
    tool_results = [{"role": "tool", "tool_call_id": call.id, "content": "ok"} for call in step.tool_calls]
    second = model.step([*turn, step.raw, *tool_results, note], TOOLS)
    assert second.text == "Done." and second.usage is not None and second.usage.prompt_tokens == 900


def test_a_fixture_can_imitate_a_service_error(tmp_path):
    write(tmp_path, "default", {"replies": [{"error": {"status": 400, "message": "maximum context length exceeded"}}]})
    model = client(tmp_path)
    try:
        model.step([{"role": "user", "content": "hi"}], TOOLS)
    except ContextOverflow:
        return
    raise AssertionError("the scripted overflow did not reach the client")


def test_structured_requests_still_answer_from_their_schema_folder(tmp_path):
    folder = tmp_path / "verdict"
    folder.mkdir()
    (folder / "default.json").write_text(json.dumps({"replies": [{"content": {"answer": "yes"}}]}))
    body = {"messages": [{"role": "user", "content": "x"}], "response_format": {"json_schema": {"name": "verdict"}}}
    response = fixture_transport(tmp_path).handle_request(
        httpx.Request("POST", "http://fixtures.invalid/v1/chat/completions", json=body)
    )
    assert json.loads(response.json()["choices"][0]["message"]["content"]) == {"answer": "yes"}
