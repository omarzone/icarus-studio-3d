import json
import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field

import httpx
from pydantic import BaseModel, ValidationError

from icarus.contracts.copilot import Capability
from icarus.copilot.response_schema import response_schema
from icarus.copilot.settings import Connection, ModelSettingsStore, answers_from_fixtures

__all__ = ["Connection", "CopilotError", "ModelClient", "NotConnected", "Reply", "capability_client", "copilot_client"]

TIMEOUT_SECONDS = 60.0
NOT_CONNECTED = "Connect a model in Settings › AI models to use the copilot."
ERROR_TEXT_LIMIT = 300
_THINK = re.compile(r"<think>(.*?)</think>", re.DOTALL)
_FORMAT_REFUSAL = re.compile(r"response_format|schema", re.IGNORECASE)
_FENCE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.DOTALL)

type Check[T] = Callable[[T], list[str]]


class CopilotError(Exception):
    """A model call that failed, with a sentence a person can read."""


class NotConnected(CopilotError):
    pass


class _FormatRefused(CopilotError):
    """The service rejected the requested response format rather than the request itself."""


@dataclass(frozen=True)
class Reply[T]:
    value: T
    thinking: str | None
    # What the caller's check still found wrong after the one retry; empty when the output passed.
    problems: list[str] = field(default_factory=list)


def _split_thinking(content: str, reasoning: object) -> tuple[str, str | None]:
    thoughts = [reasoning] if isinstance(reasoning, str) else []
    thoughts += _THINK.findall(content)
    answer = _THINK.sub("", content)
    if "</think>" in answer:
        # Some chat templates open the thinking tag in the prompt, so only its end reaches the answer.
        before, _, answer = answer.rpartition("</think>")
        thoughts.append(before.replace("<think>", ""))
    if "<think>" in answer:
        answer, _, unfinished = answer.partition("<think>")
        thoughts.append(unfinished)
    answer = answer.strip()
    fenced = _FENCE.match(answer)
    joined = "\n\n".join(thought.strip() for thought in thoughts if thought.strip())
    return (fenced.group(1) if fenced else answer), (joined or None)


def _schema_problems(error: ValidationError) -> list[str]:
    return [f"{'.'.join(str(part) for part in item['loc']) or 'output'}: {item['msg']}" for item in error.errors()]


def _feedback(problems: list[str]) -> str:
    listed = "\n".join(f"- {problem}" for problem in problems)
    return f"Your answer was rejected:\n{listed}\nAnswer again with the whole corrected JSON object."


class ModelClient:
    """The only place that calls models: OpenAI-compatible chat completions constrained by a JSON Schema."""

    def __init__(self, connection: Connection, transport: httpx.BaseTransport | None = None) -> None:
        self.connection = connection
        self._transport = transport

    def _hide_key(self, text: str) -> str:
        key = self.connection.api_key
        return text.replace(key, "…") if key else text

    def _post(self, body: dict, deadline: float | None = None) -> dict:
        headers = {"Authorization": f"Bearer {self.connection.api_key}"} if self.connection.api_key else {}
        url = f"{self.connection.endpoint}/chat/completions"
        timeout = TIMEOUT_SECONDS if deadline is None else min(TIMEOUT_SECONDS, deadline - time.monotonic())
        if timeout <= 0:
            raise CopilotError("The model ran out of time to answer")
        try:
            with httpx.Client(transport=self._transport, timeout=timeout) as http:
                response = http.post(url, json=body, headers=headers)
        except httpx.TimeoutException as error:
            raise CopilotError(f"The model took longer than {timeout:.0f} s to answer") from error
        except httpx.HTTPError as error:
            raise CopilotError(self._hide_key(f"Could not reach the model service: {error}")) from error
        if response.status_code >= 400:
            text = self._hide_key(response.text[:ERROR_TEXT_LIMIT])
            refused = response.status_code == 400 and _FORMAT_REFUSAL.search(response.text)
            error_type = _FormatRefused if refused else CopilotError
            raise error_type(f"The model service answered {response.status_code}: {text}")
        try:
            return response.json()
        except ValueError as error:
            raise CopilotError("The model service did not answer with JSON") from error

    def _message(self, body: dict, deadline: float | None = None) -> dict:
        payload = self._post(body, deadline)
        try:
            message = payload["choices"][0]["message"]
        except (KeyError, IndexError, TypeError) as error:
            raise CopilotError("The model service answered without a message") from error
        if not isinstance(message, dict):
            raise CopilotError("The model service answered without a message")
        return message

    def _complete(self, body: dict, deadline: float | None) -> tuple[str, str | None]:
        message = self._message(body, deadline)
        content = message.get("content")
        if not isinstance(content, str):
            raise CopilotError("The model service answered without text")
        return _split_thinking(content, message.get("reasoning_content") or message.get("reasoning"))

    def ask[T: BaseModel](
        self,
        role: str,
        output: type[T],
        system: str,
        user: str,
        check: Check[T] | None = None,
        deadline: float | None = None,
    ) -> Reply[T]:
        """A validated output; invalid output or a failed check is retried once with the reasons.

        A service that refuses the JSON Schema format is asked once more in JSON mode with the schema in the prompt.
        """
        messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
        schema, strict = response_schema(output)
        response_format: dict = {
            "type": "json_schema",
            "json_schema": {"name": role, "schema": schema, "strict": strict},
        }
        problems: list[str] = []
        for attempt in range(2):
            body = {"model": self.connection.model, "messages": messages, "response_format": response_format}
            try:
                content, thinking = self._complete(body, deadline)
            except _FormatRefused:
                if response_format["type"] == "json_object":
                    raise
                response_format = {"type": "json_object"}
                described = f"{system}\n\nAnswer with one JSON object that follows this JSON Schema:\n"
                messages = [
                    {"role": "system", "content": described + json.dumps(output.model_json_schema())},
                    *messages[1:],
                ]
                body = {"model": self.connection.model, "messages": messages, "response_format": response_format}
                content, thinking = self._complete(body, deadline)
            try:
                value = output.model_validate_json(content)
            except ValidationError as error:
                problems = _schema_problems(error)
            else:
                problems = check(value) if check else []
                if not problems or attempt == 1:
                    return Reply(value, thinking, problems)
            messages = [
                *messages,
                {"role": "assistant", "content": content},
                {"role": "user", "content": _feedback(problems)},
            ]
        raise CopilotError(f"The model answered twice with output that does not fit: {problems[0]}")

    def ping(self) -> None:
        """A tiny real call that succeeds when the model answers, even with empty text (reasoning models)."""
        self._message({"model": self.connection.model, "messages": [{"role": "user", "content": "Reply with OK."}]})


def _transport() -> httpx.BaseTransport | None:
    if not answers_from_fixtures():
        return None
    from icarus.copilot.fixture_provider import fixture_transport

    return fixture_transport()


def copilot_client(settings: ModelSettingsStore) -> ModelClient:
    """A reasoning client: the fixture provider when configured, else the saved connection."""
    if answers_from_fixtures():
        return ModelClient(Connection("http://fixtures.invalid/v1", "", "fixtures"), _transport())
    connection = settings.connection("reasoning")
    if connection is None:
        raise NotConnected(NOT_CONNECTED)
    return ModelClient(connection)


def capability_client(settings: ModelSettingsStore, capability: Capability) -> ModelClient | None:
    connection = settings.connection(capability)
    return ModelClient(connection, _transport()) if connection else None
