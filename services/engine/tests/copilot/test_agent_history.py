import json

import pytest

from icarus.contracts.copilot import SendMessage
from icarus.copilot import chat
from icarus.copilot.agent.budget import AgentLimits
from icarus.copilot.agent.summary_store import SummaryStore
from icarus.copilot.grounding import UNSUPPORTED_ANSWER
from icarus.copilot.settings import ModelSettingsStore
from icarus.projects.store import ProjectStore
from icarus.sim.views import ViewRenderer
from tests.copilot.agent_script import answer_call, scripted_client
from tests.copilot.test_agent_loop import make_copilot

PADDING = " Tell me more about how the car should drive around the lot and what it should avoid." * 30
TINY = AgentLimits(context_tokens=48_000, history_share=0.15, keep_recent_tokens=1_500, keep_user_tokens=60)


@pytest.fixture(scope="module")
def views():
    renderer = ViewRenderer()
    yield renderer
    renderer.close()


def summary_reply(body: dict) -> dict:
    """A summarizer that forgets the car's id until it is told, then remembers it."""
    told = any("keep these ids" in str(message["content"]) for message in body["messages"])
    summary = {
        "goal": "A vehicle that parks next to a ramp of 44.4 m",
        "decisions": [],
        "changes": [],
        "open_asks": [],
        "preferences": ["English"],
        "identifiers": ["car"] if told else ["sun"],
    }
    return {"content": json.dumps(summary)}


def test_a_long_conversation_is_summarized_and_the_summary_backs_no_numbers(tmp_path, monkeypatch, views):
    store = ProjectStore(tmp_path / "projects")
    project_id = store.create("Parking", "parking_car").project.id
    copilot = make_copilot(tmp_path, store, ModelSettingsStore(tmp_path / "settings"), views, TINY)
    replies = {"ramp is": "Noted: the ramp is 44.4 m long.", "how long": "The ramp is 44.4 m long."}

    def respond(body: dict) -> dict:
        if "response_format" in body:
            return summary_reply(body)
        person = next(m["content"] for m in reversed(body["messages"]) if m["role"] == "user")
        return answer_call(next((text for key, text in replies.items() if key in person), "Got it." + PADDING))

    client, bodies = scripted_client([respond])
    monkeypatch.setattr(chat, "copilot_client", lambda settings: client)
    copilot.send(project_id, SendMessage(text="The ramp is 44.4 m long." + PADDING))
    for turn in range(5):
        copilot.send(project_id, SendMessage(text=f"Turn {turn}: keep the car away from the sun." + PADDING))
    answer = copilot.send(project_id, SendMessage(text="how long is the ramp?")).messages[-1]

    summaries = [body for body in bodies if "response_format" in body]
    assert summaries and "keep these ids" in str(summaries[-1]["messages"][-1]["content"])
    stored = SummaryStore(tmp_path / "projects" / ".copilot").read(project_id)
    assert stored is not None and "Identifiers: car" in stored.summary
    asked = [body for body in bodies if "tools" in body and body["messages"][-1]["content"] == "how long is the ramp?"]
    last = asked[0]
    system = last["messages"][0]["content"]
    assert "Earlier in this conversation (a summary written by a model" in system and "Identifiers: car" in system
    history = [m["content"] for m in last["messages"][1:-1]]
    assert len(history) >= 4 and not any("The ramp is 44.4 m long." in text for text in history)
    assert answer.text == UNSUPPORTED_ANSWER
