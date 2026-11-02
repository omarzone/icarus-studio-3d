import json
import os
from pathlib import Path

import httpx
from pydantic import BaseModel, ConfigDict, Field, JsonValue

from icarus.copilot.agent.notes import is_engine_text

FIXTURES_ENV = "ICARUS_COPILOT_FIXTURES"
ENGINE_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_FIXTURE = "default"
# Requests that carry tools are agent steps, answered from this folder instead of a schema's.
AGENT_ROLE = "agent"


class FixtureToolCall(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    # A string is sent exactly as written, to imitate broken JSON.
    arguments: JsonValue | str


class FixtureError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: int
    message: str


class FixtureReply(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The structured output as the model would send it, or raw text to imitate a broken answer.
    content: JsonValue = None
    reasoning: str | None = None
    tool_calls: list[FixtureToolCall] = []
    usage: dict[str, int] | None = None
    error: FixtureError | None = None


class Fixture(BaseModel):
    """A recorded answer: chosen when the user's text contains one of its words, one reply per attempt or step."""

    model_config = ConfigDict(extra="forbid")

    match: list[str] = []
    replies: list[FixtureReply] = Field(min_length=1)


def fixtures_root() -> Path:
    configured = os.environ.get(FIXTURES_ENV)
    return Path(configured) if configured else ENGINE_ROOT / "tests" / "copilot" / "fixtures"


def pick_fixture(root: Path, role: str, text: str) -> Fixture:
    """The first fixture of a role, by file name, whose words appear in the text; else the role's default."""
    folder = root / role
    lowered = text.lower()
    fixtures = {
        path.stem: Fixture.model_validate_json(path.read_text(encoding="utf-8")) for path in folder.glob("*.json")
    }
    for name in sorted(fixtures):
        if name != DEFAULT_FIXTURE and any(word.lower() in lowered for word in fixtures[name].match):
            return fixtures[name]
    if DEFAULT_FIXTURE not in fixtures:
        raise LookupError(f"No fixture answers {role!r}")
    return fixtures[DEFAULT_FIXTURE]


def _text(content: object) -> str:
    if isinstance(content, list):
        return " ".join(str(part.get("text", "")) for part in content if isinstance(part, dict))
    return content if isinstance(content, str) else ""


def _person_turn(messages: list[dict]) -> tuple[str, int]:
    """The person's latest message and how many steps the model has taken since it."""
    for index in range(len(messages) - 1, -1, -1):
        message = messages[index]
        if message.get("role") == "user" and not is_engine_text(_text(message.get("content"))):
            steps = sum(1 for later in messages[index + 1 :] if later.get("role") == "assistant")
            return _text(message.get("content")), steps
    return "", 0


def _reply(root: Path, body: dict) -> tuple[FixtureReply, int, bool]:
    messages = body.get("messages", [])
    if "tools" in body:
        request, attempt = _person_turn(messages)
        fixture = pick_fixture(root, AGENT_ROLE, request)
        return fixture.replies[min(attempt, len(fixture.replies) - 1)], attempt, True
    role = body["response_format"]["json_schema"]["name"]
    request = _text(next((m["content"] for m in messages if m.get("role") == "user"), ""))
    attempt = sum(1 for m in messages if m.get("role") == "assistant")
    fixture = pick_fixture(root, role, request)
    return fixture.replies[min(attempt, len(fixture.replies) - 1)], attempt, False


def _response(root: Path, body: dict) -> httpx.Response:
    if not body.get("response_format") and "tools" not in body:
        return _completion({"role": "assistant", "content": "OK"}, None)
    reply, step, agent = _reply(root, body)
    if reply.error:
        return httpx.Response(reply.error.status, json={"error": {"message": reply.error.message}})
    content = reply.content if isinstance(reply.content, str) or reply.content is None else json.dumps(reply.content)
    message: dict = {"role": "assistant", "content": content if content is not None or agent else ""}
    if reply.reasoning:
        message["reasoning_content"] = reply.reasoning
    if reply.tool_calls:
        message["tool_calls"] = [
            {
                "id": f"call_{step}_{index}",
                "type": "function",
                "function": {
                    "name": call.name,
                    "arguments": call.arguments if isinstance(call.arguments, str) else json.dumps(call.arguments),
                },
            }
            for index, call in enumerate(reply.tool_calls)
        ]
    return _completion(message, reply.usage)


def _completion(message: dict, usage: dict[str, int] | None) -> httpx.Response:
    finish = "tool_calls" if message.get("tool_calls") else "stop"
    payload: dict = {"choices": [{"index": 0, "message": message, "finish_reason": finish}]}
    if usage:
        payload["usage"] = usage
    return httpx.Response(200, json=payload)


def fixture_transport(root: Path | None = None) -> httpx.MockTransport:
    """An offline model service that answers chat completions from recorded fixtures."""
    folder = root or fixtures_root()

    def handle(request: httpx.Request) -> httpx.Response:
        try:
            return _response(folder, json.loads(request.content))
        except (LookupError, ValueError) as error:
            return httpx.Response(404, json={"error": {"message": str(error)}})

    return httpx.MockTransport(handle)
