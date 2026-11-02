import json
import os
from pathlib import Path

import httpx
from pydantic import BaseModel, ConfigDict, Field, JsonValue

FIXTURES_ENV = "ICARUS_COPILOT_FIXTURES"
ENGINE_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_FIXTURE = "default"


class FixtureReply(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The structured output as the model would send it, or raw text to imitate a broken answer.
    content: JsonValue
    reasoning: str | None = None


class Fixture(BaseModel):
    """A recorded answer: chosen when the user's text contains one of its words, one reply per attempt."""

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


def _answer(root: Path, body: dict) -> dict:
    messages = body.get("messages", [])
    response_format = body.get("response_format")
    if not response_format:
        return {"role": "assistant", "content": "OK"}
    role = response_format["json_schema"]["name"]
    request = next((m["content"] for m in messages if m.get("role") == "user"), "")
    attempt = sum(1 for m in messages if m.get("role") == "assistant")
    fixture = pick_fixture(root, role, request)
    reply = fixture.replies[min(attempt, len(fixture.replies) - 1)]
    content = reply.content if isinstance(reply.content, str) else json.dumps(reply.content)
    message: dict = {"role": "assistant", "content": content}
    if reply.reasoning:
        message["reasoning_content"] = reply.reasoning
    return message


def fixture_transport(root: Path | None = None) -> httpx.MockTransport:
    """An offline model service that answers chat completions from recorded fixtures."""
    folder = root or fixtures_root()

    def handle(request: httpx.Request) -> httpx.Response:
        try:
            message = _answer(folder, json.loads(request.content))
        except (LookupError, ValueError) as error:
            return httpx.Response(404, json={"error": {"message": str(error)}})
        return httpx.Response(200, json={"choices": [{"index": 0, "message": message, "finish_reason": "stop"}]})

    return httpx.MockTransport(handle)
