import pytest

from icarus.contracts.events import EngineEvent
from icarus.contracts.project import ProjectState
from icarus.contracts.training import StartRun
from icarus.copilot.agent.harness import worker_tools
from icarus.copilot.agent.turn import new_message
from icarus.copilot.builtin_hooks import default_registry
from icarus.copilot.chat import Harness
from icarus.copilot.checkpoint_coach import CheckpointCoach
from icarus.copilot.hooks import HookContext, HookDecision
from icarus.copilot.settings import ModelSettingsStore
from icarus.copilot.subagents import SubagentBudget, Subagents
from icarus.projects.store import ProjectStore
from icarus.sim.views import ViewRenderer
from icarus.tasks import TaskRegistry
from icarus.training.progress_watch import WINDOW
from tests.copilot.agent_script import answer_call, call
from tests.copilot.test_agent_loop import NIGHT_OPS, make_copilot, model, say
from tests.copilot.test_autopilot import ScriptedTrainer


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


@pytest.fixture
def project_id(store) -> str:
    return store.create("Parking", "parking_car").project.id


class Collector:
    def __init__(self) -> None:
        self.events: list[tuple[EngineEvent, str | None]] = []

    def __call__(self, event: EngineEvent, project_id: str | None) -> None:
        self.events.append((event, project_id))

    def types(self) -> list[str]:
        return [event.type for event, _ in self.events]


@pytest.fixture
def harnessed(tmp_path, store, settings, views):
    copilot = make_copilot(tmp_path, store, settings, views)
    events = Collector()
    registry = TaskRegistry(events)
    hub = Subagents(registry, copilot.subagent_loop, frozenset(worker_tools()))
    copilot.attach_harness(Harness(events, default_registry(), None, hub, welcome=True))
    return copilot, events, hub


def test_a_turn_publishes_its_life_and_offers_the_extension_tools_and_skills(harnessed, project_id, monkeypatch):
    copilot, events, _ = harnessed
    bodies = model(monkeypatch, [{"tool_calls": [call("library", {"kind": "motor"})]}, answer_call("Here it is.")])
    say(copilot, project_id, "What motors are there?")
    offered = {tool["function"]["name"] for tool in bodies[0]["tools"]}
    assert {"use_skill", "remember", "recall", "compare", "delegate", "tasks", "answer"} <= offered
    assert "Skills:" in bodies[0]["messages"][0]["content"]
    types = events.types()
    assert types[0] == "turn_started" and types[-1] == "turn_finished" and "step" in types
    assert all(project == project_id for _, project in events.events)


def test_the_answer_fills_the_chat_cards_and_suggestion_intents(harnessed, project_id, monkeypatch):
    copilot, _, _ = harnessed
    card = {
        "title": "Ready to train",
        "checks": [{"text": "Wheels touch the ground", "tone": "ok"}],
        "plan": [{"mark": "change", "label": "Softer turns", "detail": "Lower the steering reward"}],
        "suggestions": ["Start training", "Explain the reward"],
        "suggestion_intents": ["train-run", "explain"],
    }
    model(monkeypatch, [answer_call("All set.", **card)])
    message = say(copilot, project_id, "Is it ready?")
    conversation = copilot.conversation(project_id)
    assert message.title == "Ready to train" and message.checks[0].tone == "ok" and message.plan[0].mark == "change"
    assert [item.intent for item in conversation.suggestion_items] == ["train-run", "explain"]
    assert conversation.suggestions == ["Start training", "Explain the reward"]


def test_a_before_tool_hook_blocks_the_call_and_the_decision_is_published(harnessed, project_id, monkeypatch):
    copilot, events, hub = harnessed
    hooks = default_registry()

    def no_library(context: HookContext) -> HookDecision | None:
        if context.tool != "library":
            return None
        return HookDecision(point=context.point, action="block", reason="Library is closed", source="test")

    hooks.register("before_tool", no_library, name="no_library")
    copilot.attach_harness(Harness(events, hooks, None, hub))
    bodies = model(monkeypatch, [{"tool_calls": [call("library", {"kind": "motor"})]}, answer_call("Closed.")])
    message = say(copilot, project_id, "What motors are there?")
    assert not message.steps[0].ok
    assert any(
        "Library is closed" in item.get("content", "") for item in bodies[1]["messages"] if item["role"] == "tool"
    )
    assert "hook_decision" in events.types()


def test_ask_mode_still_turns_a_training_start_into_a_button(harnessed, project_id, monkeypatch):
    copilot, _, _ = harnessed
    model(monkeypatch, [{"tool_calls": [call("train", {"action": "start"})]}, answer_call("Press Train now.")])
    message = say(copilot, project_id, "Train it")
    assert any(action.kind == "train" for action in message.actions)


def test_a_new_conversation_opens_with_a_title_and_three_starters_without_a_model(harnessed, project_id):
    copilot, _, _ = harnessed
    conversation = copilot.conversation(project_id)
    assert len(conversation.messages) == 1 and conversation.messages[0].title
    assert len(conversation.suggestion_items) == 3 and conversation.suggestions


def test_applying_a_proposal_through_the_chat_publishes_proposal_applied(harnessed, store, project_id, monkeypatch):
    copilot, events, _ = harnessed
    steps = [
        {"tool_calls": [call("try", {"operations": NIGHT_OPS})]},
        {"tool_calls": [call("propose", {"try_id": "t1", "summary": "Night", "explanation": "Darker sun"})]},
        answer_call("Proposed a darker sun."),
    ]
    model(monkeypatch, steps)
    message = say(copilot, project_id, "Make it night")
    assert "proposal_created" in events.types()
    assert message.proposal_id is not None
    copilot.apply(message.proposal_id)
    applied = [event for event, _ in events.events if event.type == "proposal_applied"]
    assert applied and applied[0].revision == store.state(project_id).revision.number


def test_a_subagent_runs_the_loop_with_its_own_tools_and_reports_its_answer(harnessed, project_id, monkeypatch):
    _, events, hub = harnessed
    bodies = model(monkeypatch, [answer_call("Found two motors.")])
    info = hub.delegate(project_id, "List the motors", (), ("library",), SubagentBudget(max_steps=3), "ask")
    result = hub.wait(info.id, timeout=30)
    assert result.state == "done" and result.answer == "Found two motors."
    offered = {tool["function"]["name"] for tool in bodies[0]["tools"]}
    assert offered == {"library", "answer"}
    assert "task_finished" in events.types()


def test_the_store_tells_observers_about_each_new_revision(store, project_id):
    seen = []
    store.observe(lambda project, revision: seen.append((project, revision.number)))
    store.restore(project_id, 1)
    assert seen == [(project_id, 2)]


def test_a_coached_checkpoint_posts_a_grounded_comment_and_diagnoses_only_when_a_rule_fires(
    tmp_path, store, settings, views, project_id
):
    copilot = make_copilot(tmp_path, store, settings, views)
    runs = copilot.services.runs
    trainer = ScriptedTrainer(runs, [[0.1] * (WINDOW + 1)])
    state: ProjectState = store.state(project_id)
    run_id = trainer.start(state, StartRun(total_steps=1_000_000, copies=1), 1, False).run_id
    steps = runs.folder(run_id).config().checkpoint_steps[: WINDOW + 1]
    diagnosed: list[tuple[str, int]] = []
    coach = CheckpointCoach(copilot, runs, lambda run, step, _notes: diagnosed.append((run, step)))
    coach.comment(run_id, steps[0])
    first = copilot.conversation(project_id).messages[-1]
    assert first.run is not None and first.run.milestone_step == steps[0] and first.title
    assert "1.00" in first.text and diagnosed == []
    for step in steps[1:]:
        coach.comment(run_id, step)
    assert len(diagnosed) == 1


def test_a_message_the_copilot_posts_on_its_own_is_published_for_the_open_chat(harnessed, project_id):
    copilot, events, _ = harnessed
    message = new_message("copilot", "The checkpoint reached the slot twice.")
    copilot.post(project_id, message, [])
    posted = [(event, project) for event, project in events.events if event.type == "message_posted"]
    assert len(posted) == 1
    event, project = posted[0]
    assert project == project_id
    assert event.message_id == message.id
    assert event.role == "copilot"
