import json
from collections.abc import Callable

import httpx

from icarus.copilot.client import Connection, ModelClient


def tool_step(name: str, **arguments) -> dict:
    """One scripted model step that calls one tool."""
    return {"tool_calls": [{"name": name, "arguments": arguments}]}


def answering(text: str, suggestions: list[str] | None = None, actions: list[dict] | None = None) -> dict:
    return tool_step("answer", answer=text, suggestions=suggestions or [], actions=actions or [])


def script(monkeypatch, tmp_path, **turns: list[dict]) -> None:
    """Agent fixtures by file name: each scripts one turn, a reply per step; "match" in the first picks it by words."""
    folder = tmp_path / "fixtures" / "agent"
    folder.mkdir(parents=True, exist_ok=True)
    for name, replies in turns.items():
        match = replies[0].pop("match", [])
        (folder / f"{name}.json").write_text(json.dumps({"match": match, "replies": replies}))
    monkeypatch.setenv("ICARUS_COPILOT_FIXTURES", str(tmp_path / "fixtures"))


def call(name: str, arguments: dict | str) -> dict:
    """A tool call as a scripted step writes it; a string is sent as is, to imitate broken JSON."""
    return {"name": name, "arguments": arguments if isinstance(arguments, str) else json.dumps(arguments)}


def scripted_client(steps: list[dict | Callable[[dict], dict]]) -> tuple[ModelClient, list[dict]]:
    """A model whose n-th agent step answers with steps[n] (the last one repeats): a message dict with "content"
    and "tool_calls", a function of the request body returning one, or {"error": (status, text)}."""
    bodies: list[dict] = []

    def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        bodies.append(body)
        step = steps[min(len(bodies) - 1, len(steps) - 1)]
        reply: dict = step(body) if callable(step) else step
        if "error" in reply:
            status, text = reply["error"]
            return httpx.Response(status, json={"error": {"message": text}})
        calls = [
            {"id": f"c{len(bodies)}_{index}", "type": "function", "function": item}
            for index, item in enumerate(reply.get("tool_calls", []))
        ]
        message = {"role": "assistant", "content": reply.get("content")} | ({"tool_calls": calls} if calls else {})
        return httpx.Response(200, json={"choices": [{"message": message}], "usage": reply.get("usage")})

    client = ModelClient(Connection("http://scripted.invalid/v1", "", "scripted"), httpx.MockTransport(handle))
    return client, bodies


def answer_call(text: str, **fields) -> dict:
    return {"tool_calls": [call("answer", {"answer": text, "suggestions": [], "actions": []} | fields)]}
