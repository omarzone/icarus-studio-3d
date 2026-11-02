import json
import threading

import pytest

from icarus.contracts.copilot import SendMessage
from icarus.copilot import chat
from icarus.copilot.agent import loop
from icarus.copilot.agent.budget import AgentLimits, TurnBudget
from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, ToolServices, TurnScope
from icarus.copilot.attachments import AttachmentStore
from icarus.copilot.chat import Copilot
from icarus.copilot.chat_training import ChatTrainer
from icarus.copilot.client import CopilotError, ToolCall
from icarus.copilot.conversation_store import ConversationStore
from icarus.copilot.grounding import UNSUPPORTED_ANSWER
from icarus.copilot.settings import ModelSettingsStore
from icarus.projects.store import ProjectStore
from icarus.sim.views import ViewRenderer
from icarus.training.run_store import RunStore
from icarus.training.settings import TrainingSettingsStore
from icarus.training.supervisor import Supervisor
from tests.copilot.agent_script import answer_call, call, scripted_client

NIGHT_OPS = [
    {
        "op": "set_property",
        "object": "sun",
        "component": "light",
        "property": "intensity",
        "value": {"type": "slider", "value": 0.25},
    }
]


@pytest.fixture(scope="module")
def views():
    renderer = ViewRenderer()
    yield renderer
    renderer.close()


@pytest.fixture
def store(tmp_path) -> ProjectStore:
    return ProjectStore(tmp_path / "projects")


@pytest.fixture
def settings(tmp_path) -> ModelSettingsStore:
    return ModelSettingsStore(tmp_path / "settings")


def make_copilot(tmp_path, store, settings, views, limits: AgentLimits | None = None) -> Copilot:
    runs = RunStore(tmp_path / "runs")
    trainer = ChatTrainer(
        store, runs, Supervisor(runs), TrainingSettingsStore(tmp_path / "runs", tmp_path / "projects")
    )
    projects = tmp_path / "projects"
    attachments = AttachmentStore(projects)
    return Copilot(store, runs, ConversationStore(projects), settings, trainer, attachments, views, limits)


@pytest.fixture
def copilot(tmp_path, store, settings, views) -> Copilot:
    return make_copilot(tmp_path, store, settings, views)


@pytest.fixture
def project_id(store) -> str:
    return store.create("Parking", "parking_car").project.id


def model(monkeypatch, steps: list) -> list[dict]:
    client, bodies = scripted_client(steps)
    monkeypatch.setattr(chat, "copilot_client", lambda settings: client)
    return bodies


def say(copilot: Copilot, project_id: str, text: str, selection: str | None = None):
    return copilot.send(project_id, SendMessage(text=text, selection=selection)).messages[-1]


def tool_results(body: dict) -> dict[str, str]:
    return {message["tool_call_id"]: message["content"] for message in body["messages"] if message["role"] == "tool"}


def test_broken_calls_reach_the_model_as_results_and_never_run(copilot, store, project_id, monkeypatch):
    broken = {
        "tool_calls": [
            call("try", '{"operations": ['),
            call("try", {"operations": [], "look": None}),
            call("inspect_object", {"object": "teapot"}),
            call("teleport", {"to": "goal"}),
        ]
    }
    fixed = {"tool_calls": [call("try", {"operations": NIGHT_OPS, "look": None})]}
    bodies = model(monkeypatch, [broken, fixed, answer_call("Tried it.")])
    answer = say(copilot, project_id, "make it night")
    results = tool_results(bodies[1])
    assert results["c1_0"] == "Arguments must be one JSON object; the tool was not run."
    assert "operations: List should have at least 1 item" in results["c1_1"]
    assert "There is no object or body `teapot`" in results["c1_2"] and "steer_left" in results["c1_2"]
    assert results["c1_3"].startswith("No tool named `teleport`. Available: inspect_object, read_run, library")
    assert json.loads(tool_results(bodies[2])["c2_0"])["try_id"] == "t1"
    assert store.state(project_id).revision.number == 1
    assert [(step.tool, step.ok) for step in answer.steps] == [
        ("try", False),
        ("try", False),
        ("inspect", False),
        ("try", True),
    ]


def test_a_turn_that_never_answers_is_wrapped_up_by_forcing_the_answer(copilot, project_id, monkeypatch):
    objects = ["ground", "sun", "spawn", "sky", "car", "steer_left", "wheel_front_left", "steer_right", "goal"]

    def inspect_next(body: dict) -> dict:
        if isinstance(body.get("tool_choice"), dict):
            return answer_call("I looked at nine objects and stopped there.")
        steps = sum(1 for message in body["messages"] if message["role"] == "assistant")
        return {"tool_calls": [call("inspect_object", {"object": objects[steps % len(objects)]})]}

    bodies = model(monkeypatch, [inspect_next])
    answer = say(copilot, project_id, "inspect everything")
    assert len(bodies) == 10
    assert bodies[-1]["tool_choice"] == {"type": "function", "function": {"name": "answer"}}
    assert "limit of 10 steps" in bodies[-1]["messages"][-1]["content"]
    assert answer.text == "I looked at nine objects and stopped there." and len(answer.steps) == 9


def test_when_even_the_wrap_up_does_not_answer_the_engine_says_which_limit_was_reached(
    copilot, project_id, monkeypatch
):
    objects = ["ground", "sun", "spawn", "sky", "car", "steer_left", "wheel_front_left", "steer_right", "goal"]

    def inspect_next(body: dict) -> dict:
        steps = sum(1 for message in body["messages"] if message["role"] == "assistant")
        return {"tool_calls": [call("inspect_object", {"object": objects[steps % len(objects)]})]}

    model(monkeypatch, [inspect_next])
    assert say(copilot, project_id, "inspect everything").text.startswith("I reached the limit of 10 steps")


def test_the_third_identical_call_is_not_run_and_the_turn_wraps_up(copilot, project_id, monkeypatch):
    same = {"tool_calls": [call("inspect_object", {"object": "sun"})]}
    bodies = model(monkeypatch, [same, same, same, answer_call("The sun is a light.")])
    answer = say(copilot, project_id, "what is the sun?")
    assert tool_results(bodies[3])["c3_0"] == "You already did this twice; the result has not changed."
    assert bodies[3]["tool_choice"] == {"type": "function", "function": {"name": "answer"}}
    assert [step.summary for step in answer.steps][-1] == "Could not inspect: repeated step"


def test_a_number_from_a_tool_result_backs_the_answer_and_an_invented_one_does_not(
    copilot, store, project_id, monkeypatch
):
    explained = answer_call("Its motor pushes with up to 2000 N.")
    model(monkeypatch, [{"tool_calls": [call("inspect_object", {"object": "steer_left"})]}, explained])
    assert say(copilot, project_id, "how strong is the steering?").text == "Its motor pushes with up to 2000 N."
    bodies = model(monkeypatch, [explained])
    fresh = store.create("Fresh", "parking_car").project.id
    assert say(copilot, fresh, "how strong is the steering?").text == UNSUPPORTED_ANSWER
    assert "2000" in tool_results(bodies[1])["c1_0"] and len(bodies) == 2


def test_a_failure_after_a_change_keeps_the_change_in_the_message(copilot, store, project_id, monkeypatch):
    copilot.set_autonomy(project_id, "autopilot")
    steps = [
        {"tool_calls": [call("try", {"operations": NIGHT_OPS, "look": None})]},
        {"tool_calls": [call("apply", {"try_id": "t1", "summary": "Dim the sun"})]},
        {"error": (400, "Unknown model scripted")},
    ]
    model(monkeypatch, steps)
    answer = say(copilot, project_id, "dim the sun")
    assert store.state(project_id).revision.number == 2
    assert answer.text.startswith("I applied “Dim the sun” as revision 2. Then I could not finish")
    assert answer.proposal_id is not None and [step.tool for step in answer.steps] == ["try", "propose"]


def test_a_failure_before_anything_changed_is_an_error(copilot, project_id, monkeypatch):
    model(monkeypatch, [{"error": (400, "Unknown model scripted")}])
    with pytest.raises(CopilotError):
        say(copilot, project_id, "hello")
    assert copilot.conversation(project_id).messages == []


def test_an_overflow_prunes_lowers_the_window_and_retries_once(copilot, settings, project_id, monkeypatch):
    steps = [
        {"tool_calls": [call("inspect_object", {"object": "car"})]},
        {"error": (400, "This model's maximum context length is 8192 tokens")},
        answer_call("The car is a box."),
    ]
    bodies = model(monkeypatch, steps)
    assert say(copilot, project_id, "what is the car?").text == "The car is a box."
    learned = settings.context_tokens("reasoning")
    assert learned is not None and learned < 64_000
    assert tool_results(bodies[2])["c1_0"].endswith("(details dropped; call the tool again if needed)")


def test_a_second_overflow_ends_the_turn_and_keeps_its_steps(copilot, project_id, monkeypatch):
    overflow = {"error": (400, "maximum context length exceeded")}
    model(monkeypatch, [{"tool_calls": [call("inspect_object", {"object": "car"})]}, overflow])
    answer = say(copilot, project_id, "what is the car?")
    assert "no longer fits the model" in answer.text and [step.tool for step in answer.steps] == ["inspect"]


def test_a_service_without_tools_gets_the_single_reply_path_from_then_on(copilot, project_id, monkeypatch):
    def refuse_tools(body: dict) -> dict:
        if "tools" in body:
            return {"error": (400, "tools are not supported by this model")}
        reply = {"answer": "Hello.", "proposal": None, "suggestions": [], "training": None}
        return {"content": json.dumps(reply)}

    bodies = model(monkeypatch, [refuse_tools])
    assert say(copilot, project_id, "hi").text == "Hello."
    assert say(copilot, project_id, "hi again").text == "Hello."
    assert ["tools" in body for body in bodies] == [True, False, False]


@pytest.mark.needs_gl
def test_look_attaches_a_real_render_with_the_goal_zone_and_old_pictures_are_retired(
    copilot, project_id, monkeypatch, tmp_path
):
    looking = [
        {
            "tool_calls": [
                call("look", {"target": "goal", "view": view, "distance_m": None, "zones": True, "on_try": None})
            ]
        }
        for view in ("top", "left", "front")
    ]
    bodies = model(monkeypatch, [*looking, answer_call("Here is the parking spot.")])
    answer = say(copilot, project_id, "show me the parking spot")
    first = tool_results(bodies[1])["c1_0"]
    assert "goal:goal_zone (green)" in first and "spawn:spawn_point (blue)" in first
    assert [item.kind for item in answer.attachments] == ["view", "view", "view"]
    picture = AttachmentStore(tmp_path / "projects").get(answer.attachments[0].id).content()
    assert picture.startswith(b"\x89PNG\r\n\x1a\n")
    pictures = [
        part
        for message in bodies[3]["messages"]
        if isinstance(message["content"], list)
        for part in message["content"]
        if part.get("type") == "image_url"
    ]
    assert len(pictures) == 2 and answer.steps[0].summary == "Looked at Parking spot (goal zone) from above"


def test_a_second_message_while_one_is_answered_is_refused(copilot, project_id, monkeypatch):
    answering, release = threading.Event(), threading.Event()

    def slow(body: dict) -> dict:
        answering.set()
        release.wait(10)
        return answer_call("Hi.")

    model(monkeypatch, [slow])
    first = threading.Thread(target=say, args=(copilot, project_id, "hi"))
    first.start()
    assert answering.wait(10)
    with pytest.raises(chat.CopilotBusy):
        say(copilot, project_id, "are you there?")
    release.set()
    first.join(10)
    assert [message.text for message in copilot.conversation(project_id).messages] == ["hi", "Hi."]


class _Args(ToolArgs):
    name: str


def test_reads_in_one_step_overlap_and_a_write_runs_after_them(store, project_id, monkeypatch, tmp_path):
    both_running = threading.Barrier(2, timeout=5)
    order: list[str] = []

    def slow_read(scope: TurnScope, args: _Args) -> Observation:
        both_running.wait()
        order.append(args.name)
        return Observation(f"read {args.name}")

    def write(scope: TurnScope, args: _Args) -> Observation:
        order.append(f"write {args.name}")
        return Observation("written")

    fake = {
        "peek": Tool("peek", "", _Args, "inspect", "read", slow_read, None, 5),
        "poke": Tool("poke", "", _Args, "propose", "write", write, None, 5),
    }
    monkeypatch.setattr(loop, "REGISTRY", fake)
    services = ToolServices(store, RunStore(tmp_path / "runs"), None, None, None)  # type: ignore[arg-type]
    scope = TurnScope(project_id, store.state(project_id), "ask", services)
    calls = [
        ToolCall("a", "peek", '{"name": "a"}'),
        ToolCall("b", "peek", '{"name": "b"}'),
        ToolCall("c", "poke", '{"name": "c"}'),
    ]
    batch = loop.execute_batch(scope, calls, TurnBudget(AgentLimits(), 64_000), None)
    assert sorted(order[:2]) == ["a", "b"] and order[2] == "write c"
    assert [message["tool_call_id"] for message in batch.messages] == ["a", "b", "c"]


def test_operations_sent_as_a_json_string_are_refused_with_a_hint_and_not_decoded(copilot, project_id, monkeypatch):
    encoded = {"tool_calls": [call("try", {"operations": json.dumps(NIGHT_OPS), "look": None})]}
    bodies = model(monkeypatch, [encoded, answer_call("Sorry.")])
    say(copilot, project_id, "make it night")
    result = tool_results(bodies[1])["c1_0"]
    assert "operations: you sent a string that contains JSON; send the JSON array or object itself" in result


def test_the_last_step_may_still_propose_a_change_that_passed_its_try(copilot, project_id, monkeypatch):
    objects = ["ground", "sun", "spawn", "sky", "car", "steer_left", "wheel_front_left"]

    def work(body: dict) -> dict:
        steps = sum(1 for message in body["messages"] if message["role"] == "assistant")
        if str(body["messages"][-1]["content"]).startswith("[Engine note] You have reached"):
            propose = {"try_id": "t1", "summary": "Make it night", "explanation": "Dims the Sun.", "warnings": []}
            return {"tool_calls": [call("propose", propose), *answer_call("Here it is.")["tool_calls"]]}
        if steps == 0:
            return {"tool_calls": [call("try", {"operations": NIGHT_OPS, "look": None})]}
        return {"tool_calls": [call("inspect_object", {"object": objects[steps % len(objects)]})]}

    bodies = model(monkeypatch, [work])
    conversation = copilot.send(project_id, SendMessage(text="make it night"))
    assert "you may call propose with its try_id" in bodies[-1]["messages"][-1]["content"]
    assert conversation.proposals[0].summary == "Make it night"
    assert conversation.messages[-1].text == "Here it is."


def test_a_plain_text_ending_is_restated_once_through_answer_to_get_its_buttons(copilot, project_id, monkeypatch):
    buttons = [{"label": "Open Train", "kind": "navigate", "target": "SCR-TRAIN"}]
    bodies = model(monkeypatch, [{"content": "Hi there."}, answer_call("Hi there.", actions=buttons)])
    answer = say(copilot, project_id, "hi")
    assert "tool_choice" not in bodies[0]
    assert bodies[1]["tool_choice"] == {"type": "function", "function": {"name": "answer"}}
    assert answer.text == "Hi there." and [(a.kind, a.target) for a in answer.actions] == [("navigate", "SCR-TRAIN")]


def test_a_plain_text_ending_stays_when_restating_it_fails(copilot, project_id, monkeypatch):
    model(monkeypatch, [{"content": "Hi there."}, {"error": (400, "Unknown model scripted")}])
    assert say(copilot, project_id, "hi").text == "Hi there."
