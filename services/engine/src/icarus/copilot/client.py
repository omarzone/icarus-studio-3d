import json
import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

import httpx
from pydantic import BaseModel, ValidationError

from icarus.contracts.copilot import Capability
from icarus.copilot.response_schema import response_schema
from icarus.copilot.settings import Connection, ModelSettingsStore, answers_from_fixtures

__all__ = [
    "Connection",
    "ContextOverflow",
    "CopilotError",
    "InputRejected",
    "ModelClient",
    "ModelTurn",
    "NotConnected",
    "Reply",
    "ToolCall",
    "ToolsRefused",
    "Usage",
    "UserContent",
    "capability_client",
    "copilot_client",
]

TIMEOUT_SECONDS = 60.0
NOT_CONNECTED = "Connect a model in Settings › AI models to use the copilot."
ERROR_TEXT_LIMIT = 300
_THINK = re.compile(r"<think>(.*?)</think>", re.DOTALL)
_FORMAT_REFUSAL = re.compile(r"response_format|schema", re.IGNORECASE)
_TOOLS_REFUSAL = re.compile(r"\btools?\b|tool_choice|function", re.IGNORECASE)
_OVERFLOW = re.compile(
    r"context length|context window|maximum context|too many tokens|context_length_exceeded|prompt is too long",
    re.IGNORECASE,
)
_FENCE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.DOTALL)
# Statuses with which a service refuses the request's content, such as pictures a text-only model cannot read.
_INPUT_REFUSALS = frozenset({400, 413, 415, 422})
# Statuses worth one more attempt: the service was busy or failed, not the request.
_TRANSIENT = frozenset({429, 500, 502, 503, 504})
RETRY_WAIT_SECONDS = 2.0
RETRY_WAIT_LIMIT = 10.0
_FINISHES = ("stop", "tool_calls", "length", "content_filter")

type Check[T] = Callable[[T], list[str]]
# A user turn: plain text, or OpenAI content parts (text and image_url) when it carries pictures.
type UserContent = str | list[dict[str, object]]
type Finish = Literal["stop", "tool_calls", "length", "content_filter", "other"]


class CopilotError(Exception):
    """A model call that failed, with a sentence a person can read."""


class NotConnected(CopilotError):
    pass


class _Transient(CopilotError):
    """A failed connection or a timeout, worth one more attempt."""


class InputRejected(CopilotError):
    """The service refused what was sent rather than failing to answer."""


class _FormatRefused(InputRejected):
    """The service rejected the requested response format rather than the request itself."""


class ToolsRefused(InputRejected):
    """The service does not accept native tool calls."""


class ContextOverflow(InputRejected):
    """The request is longer than the model's context window."""


@dataclass(frozen=True)
class Usage:
    prompt_tokens: int
    completion_tokens: int


@dataclass(frozen=True)
class Reply[T]:
    value: T
    thinking: str | None
    # What the caller's check still found wrong after the one retry; empty when the output passed.
    problems: list[str] = field(default_factory=list)
    usage: Usage | None = None


@dataclass(frozen=True)
class ToolCall:
    id: str
    name: str
    # The arguments exactly as the model sent them; the caller parses and validates them, never repaired here.
    arguments: str


@dataclass(frozen=True)
class ModelTurn:
    text: str | None
    thinking: str | None
    tool_calls: list[ToolCall]
    finish: Finish
    usage: Usage | None
    # The assistant message to send back in the next request, without reasoning fields.
    raw: dict


def _usage(payload: dict) -> Usage | None:
    usage = payload.get("usage")
    if not isinstance(usage, dict) or not isinstance(usage.get("prompt_tokens"), int):
        return None
    completion = usage.get("completion_tokens")
    return Usage(usage["prompt_tokens"], completion if isinstance(completion, int) else 0)


def _tool_calls(message: dict) -> list[ToolCall]:
    calls: list[ToolCall] = []
    for index, item in enumerate(message.get("tool_calls") or []):
        function = item.get("function") if isinstance(item, dict) else None
        if not isinstance(function, dict):
            continue
        arguments = function.get("arguments")
        # A few services send the arguments as an object instead of JSON text.
        text = arguments if isinstance(arguments, str) else json.dumps(arguments)
        call_id = item.get("id")
        calls.append(
            ToolCall(
                call_id if isinstance(call_id, str) and call_id else f"call_{index}",
                str(function.get("name") or ""),
                text,
            )
        )
    return calls


def _finish(reason: object, calls: list[ToolCall]) -> Finish:
    for known in _FINISHES:
        if reason == known:
            return "tool_calls" if calls and known == "stop" else known
    return "tool_calls" if calls else "other"


def _retry_wait(response: httpx.Response) -> float:
    try:
        return min(float(response.headers.get("Retry-After", RETRY_WAIT_SECONDS)), RETRY_WAIT_LIMIT)
    except ValueError:
        return RETRY_WAIT_SECONDS


def _split_thinking(content: str, reasoning: object, unfence: bool = True) -> tuple[str, str | None]:
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
    fenced = _FENCE.match(answer) if unfence else None
    joined = "\n\n".join(thought.strip() for thought in thoughts if thought.strip())
    return (fenced.group(1) if fenced else answer), (joined or None)


def schema_problems(error: ValidationError) -> list[str]:
    return [f"{'.'.join(str(part) for part in item['loc']) or 'output'}: {item['msg']}" for item in error.errors()]


def _feedback(problems: list[str]) -> str:
    listed = "\n".join(f"- {problem}" for problem in problems)
    return f"Your answer was rejected:\n{listed}\nAnswer again with the whole corrected JSON object."


class ModelClient:
    """The only place that calls models: OpenAI-compatible chat completions, structured or with native tools."""

    def __init__(self, connection: Connection, transport: httpx.BaseTransport | None = None) -> None:
        self.connection = connection
        self._transport = transport

    def _hide_key(self, text: str) -> str:
        key = self.connection.api_key
        return text.replace(key, "…") if key else text

    def _send(self, body: dict, timeout: float) -> httpx.Response:
        headers = {"Authorization": f"Bearer {self.connection.api_key}"} if self.connection.api_key else {}
        url = f"{self.connection.endpoint}/chat/completions"
        try:
            with httpx.Client(transport=self._transport, timeout=timeout) as http:
                return http.post(url, json=body, headers=headers)
        except httpx.TimeoutException as error:
            raise _Transient(f"The model took longer than {timeout:.0f} s to answer") from error
        except httpx.HTTPError as error:
            raise _Transient(self._hide_key(f"Could not reach the model service: {error}")) from error

    def _refusal(self, body: dict, response: httpx.Response) -> CopilotError:
        status, text = response.status_code, response.text
        message = f"The model service answered {status}: {self._hide_key(text[:ERROR_TEXT_LIMIT])}"
        if status in (400, 413) and _OVERFLOW.search(text):
            return ContextOverflow(message)
        if status == 400 and "tools" in body and _TOOLS_REFUSAL.search(text):
            return ToolsRefused(message)
        if status == 400 and "response_format" in body and _FORMAT_REFUSAL.search(text):
            return _FormatRefused(message)
        return InputRejected(message) if status in _INPUT_REFUSALS else CopilotError(message)

    def _post(self, body: dict, deadline: float | None = None, patience: float = TIMEOUT_SECONDS) -> dict:
        """The service's JSON answer; a busy service, a failed connection or a timeout gets one more attempt."""
        for attempt in range(2):
            timeout = patience if deadline is None else min(patience, deadline - time.monotonic())
            if timeout <= 0:
                raise CopilotError("The model ran out of time to answer")
            try:
                response = self._send(body, timeout)
            except _Transient as error:
                if attempt == 1:
                    raise CopilotError(str(error)) from error
                continue
            if response.status_code in _TRANSIENT and attempt == 0:
                wait = _retry_wait(response)
                if deadline is None or time.monotonic() + wait < deadline:
                    time.sleep(wait)
                    continue
            if response.status_code >= 400:
                raise self._refusal(body, response)
            try:
                return response.json()
            except ValueError as error:
                raise CopilotError("The model service did not answer with JSON") from error
        raise CopilotError("The model service did not answer")

    def _choice(self, body: dict, deadline: float | None, patience: float) -> tuple[dict, dict, dict]:
        """The answer's message, its choice and the whole payload."""
        payload = self._post(body, deadline, patience)
        try:
            choice = payload["choices"][0]
            message = choice["message"]
        except (KeyError, IndexError, TypeError) as error:
            raise CopilotError("The model service answered without a message") from error
        if not isinstance(message, dict) or not isinstance(choice, dict):
            raise CopilotError("The model service answered without a message")
        return message, choice, payload

    def _complete(self, body: dict, deadline: float | None, patience: float) -> tuple[str, str | None, Usage | None]:
        message, _, payload = self._choice(body, deadline, patience)
        content = message.get("content")
        if not isinstance(content, str):
            raise CopilotError("The model service answered without text")
        answer, thinking = _split_thinking(content, message.get("reasoning_content") or message.get("reasoning"))
        return answer, thinking, _usage(payload)

    def ask[T: BaseModel](
        self,
        role: str,
        output: type[T],
        system: str,
        user: UserContent,
        check: Check[T] | None = None,
        deadline: float | None = None,
        timeout: float = TIMEOUT_SECONDS,
    ) -> Reply[T]:
        """A validated output; invalid output or a failed check is retried once with the reasons.

        A service that refuses the JSON Schema format is asked once more in JSON mode with the schema in the prompt.
        """
        # Some services accept response_format without enforcing it, so the model also reads the schema.
        described = f"{system}\n\nAnswer with one JSON object that follows this JSON Schema:\n"
        described += json.dumps(output.model_json_schema())
        messages = [{"role": "system", "content": described}, {"role": "user", "content": user}]
        schema, strict = response_schema(output)
        response_format: dict = {
            "type": "json_schema",
            "json_schema": {"name": role, "schema": schema, "strict": strict},
        }
        problems: list[str] = []
        for attempt in range(2):
            body = {"model": self.connection.model, "messages": messages, "response_format": response_format}
            try:
                content, thinking, usage = self._complete(body, deadline, timeout)
            except _FormatRefused:
                if response_format["type"] == "json_object":
                    raise
                response_format = {"type": "json_object"}
                body = {"model": self.connection.model, "messages": messages, "response_format": response_format}
                content, thinking, usage = self._complete(body, deadline, timeout)
            try:
                value = output.model_validate_json(content)
            except ValidationError as error:
                problems = schema_problems(error)
            else:
                problems = check(value) if check else []
                if not problems or attempt == 1:
                    return Reply(value, thinking, problems, usage)
            messages = [
                *messages,
                {"role": "assistant", "content": content},
                {"role": "user", "content": _feedback(problems)},
            ]
        raise CopilotError(f"The model answered twice with output that does not fit: {problems[0]}")

    def step(
        self,
        messages: list[dict],
        tools: list[dict],
        tool_choice: str = "auto",
        deadline: float | None = None,
        timeout: float = TIMEOUT_SECONDS,
    ) -> ModelTurn:
        """One agent step with native tools: text, tool calls to run, or both. A tool name in tool_choice forces it."""
        body: dict = {"model": self.connection.model, "messages": messages, "tools": tools}
        if tool_choice in ("required", "none"):
            body["tool_choice"] = tool_choice
        elif tool_choice != "auto":
            body["tool_choice"] = {"type": "function", "function": {"name": tool_choice}}
        try:
            message, choice, payload = self._choice(body, deadline, timeout)
        except ToolsRefused:
            if "tool_choice" not in body:
                raise
            # Some services take tools but not a forced choice; the caller still asks for an answer in words.
            body.pop("tool_choice")
            message, choice, payload = self._choice(body, deadline, timeout)
        content = message.get("content")
        reasoning = message.get("reasoning_content") or message.get("reasoning")
        text, thinking = _split_thinking(content if isinstance(content, str) else "", reasoning, unfence=False)
        calls = _tool_calls(message)
        raw: dict = {"role": "assistant", "content": text or None}
        if calls:
            raw["tool_calls"] = [
                {"id": call.id, "type": "function", "function": {"name": call.name, "arguments": call.arguments}}
                for call in calls
            ]
        return ModelTurn(
            text or None, thinking, calls, _finish(choice.get("finish_reason"), calls), _usage(payload), raw
        )

    def ping(self) -> None:
        """A tiny real call that succeeds when the model answers, even with empty text (reasoning models)."""
        self._choice(
            {"model": self.connection.model, "messages": [{"role": "user", "content": "Reply with OK."}]},
            None,
            TIMEOUT_SECONDS,
        )


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
