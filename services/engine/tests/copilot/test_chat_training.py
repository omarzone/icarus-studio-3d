import json
import sys
from collections.abc import Iterator

import httpx
import pytest

from icarus.contracts.copilot import SendMessage
from icarus.contracts.training import StartRun
from icarus.copilot import fixture_provider
from icarus.copilot.attachments import AttachmentStore
from icarus.copilot.chat import Copilot
from icarus.copilot.chat_training import ChatTrainer
from icarus.copilot.conversation_store import ConversationStore
from icarus.copilot.settings import ModelSettingsStore
from icarus.projects.store import ProjectStore
from icarus.training.run_store import RunStore
from icarus.training.settings import TrainingSettingsStore
from icarus.training.supervisor import Supervisor
from tests.copilot.agent_script import answering, script, tool_step
from tests.training.test_supervisor import FAKE_WORKER, state_is, wait_for

START = tool_step("train", action="start", total_steps=10_000, copies=1)
STOP = tool_step("train", action="stop", total_steps=None, copies=None)
NIGHT_OPS = [
    {
        "op": "set_property",
        "object": "sun",
        "component": "light",
        "property": "intensity",
        "value": {"type": "slider", "value": 0.25},
    }
]


@pytest.fixture
def runs(tmp_path) -> RunStore:
    return RunStore(tmp_path / "runs")


@pytest.fixture
def supervisor(runs) -> Iterator[Supervisor]:
    command = lambda run_dir, use_graphics_card: [sys.executable, str(FAKE_WORKER), str(run_dir), "obey"]  # noqa: E731
    supervisor = Supervisor(runs, command=command)
    yield supervisor
    supervisor.shutdown(timeout=10)


@pytest.fixture
def store(tmp_path) -> ProjectStore:
    return ProjectStore(tmp_path / "projects")


@pytest.fixture
def copilot(tmp_path, store, runs, supervisor) -> Copilot:
    trainer = ChatTrainer(store, runs, supervisor, TrainingSettingsStore(tmp_path / "runs", tmp_path / "projects"))
    projects = tmp_path / "projects"
    settings = ModelSettingsStore(tmp_path)
    return Copilot(store, runs, ConversationStore(projects), settings, trainer, AttachmentStore(projects))


@pytest.fixture
def project_id(store) -> str:
    return store.create("Parking", "parking_car").project.id


@pytest.fixture
def trains(monkeypatch, tmp_path) -> None:
    """A model that starts training when asked in Spanish and stops it when asked to stop."""
    script(
        monkeypatch,
        tmp_path,
        entrena=[START | {"match": ["entr"]}, answering("Vamos a entrenarlo.")],
        stop=[STOP | {"match": ["stop"]}, answering("Stopping it.")],
    )


def say(copilot: Copilot, project_id: str, text: str):
    return copilot.send(project_id, SendMessage(text=text, selection=None, workspace="Train")).messages[-1]


def test_in_ask_mode_asking_to_train_offers_a_train_button_instead_of_starting(copilot, runs, project_id, trains):
    answer = say(copilot, project_id, "entrénalo")
    assert runs.list_runs(project_id) == []
    assert [(action.kind, action.label) for action in answer.actions] == [("train", "Entrenar ahora")]
    assert [(step.tool, step.summary) for step in answer.steps] == [("train", "Offered a Train button")]


def test_in_autopilot_asking_to_train_starts_a_run_and_asking_to_stop_stops_it(copilot, runs, project_id, trains):
    copilot.set_autonomy(project_id, "autopilot")
    answer = say(copilot, project_id, "entrénalo").text
    (run,) = runs.list_runs(project_id)
    assert answer.startswith("Vamos a entrenarlo.") and run.name in answer
    assert run.total_steps == 10_000 and run.copies == 1
    wait_for(state_is(runs, run.run_id, "running"))
    copilot.set_autonomy(project_id, "ask")
    assert run.name in say(copilot, project_id, "stop").text
    wait_for(state_is(runs, run.run_id, "stopped"))


def test_asking_to_train_while_a_run_trains_says_that_one_is_running(
    copilot, store, runs, supervisor, project_id, trains
):
    copilot.set_autonomy(project_id, "autopilot")
    running = supervisor.start(store.state(project_id), StartRun(total_steps=10_000, copies=1), 1, False)
    answer = say(copilot, project_id, "entrénalo otra vez")
    assert f"{running.name} ya está entrenando" in answer.text and answer.actions == []
    assert [run.run_id for run in runs.list_runs(project_id)] == [running.run_id]


def test_training_defaults_come_from_the_recommended_budget_and_the_brain(
    copilot, store, runs, project_id, monkeypatch, tmp_path
):
    script(monkeypatch, tmp_path, default=[tool_step("train", action="start"), answering("Ok.")])
    copilot.set_autonomy(project_id, "autopilot")
    say(copilot, project_id, "entrénalo")
    (run,) = runs.list_runs(project_id)
    assert run.total_steps == 1_000_000 and run.copies == store.state(project_id).project.brain.copies


def test_a_project_without_a_task_is_not_trained_and_the_answer_says_why(copilot, store, runs, trains):
    project_id = store.create("Empty", "empty_world").project.id
    copilot.set_autonomy(project_id, "autopilot")
    answer = say(copilot, project_id, "entrénalo")
    assert runs.list_runs(project_id) == [] and "No empecé a entrenar" in answer.text


def test_stopping_with_nothing_training_says_so(copilot, project_id, trains):
    assert "nothing to stop" in say(copilot, project_id, "stop").text


def test_autopilot_trains_the_revision_it_applies_in_the_same_step(
    copilot, store, runs, project_id, monkeypatch, tmp_path
):
    fix_and_train = {
        "tool_calls": [
            {"name": "train", "arguments": {"action": "start", "total_steps": 10_000, "copies": 1}},
            {"name": "apply", "arguments": {"try_id": "t1", "summary": "Dim the sun"}},
        ]
    }
    try_night = tool_step("try", operations=NIGHT_OPS, look=None)
    script(monkeypatch, tmp_path, default=[try_night, fix_and_train, answering("Fixed and training.")])
    copilot.set_autonomy(project_id, "autopilot")
    answer = say(copilot, project_id, "fix it and train")
    (run,) = runs.list_runs(project_id)
    assert store.state(project_id).revision.number == 2 and run.revision_number == 2
    assert [step.tool for step in answer.steps] == ["try", "propose", "train"] and answer.steps[1].ok


@pytest.fixture
def systems(monkeypatch) -> list[str]:
    """The system prompt of every agent step the fixture model receives."""
    seen: list[str] = []
    original = fixture_provider.fixture_transport

    def capturing(root=None) -> httpx.MockTransport:
        fixtures = original(root)

        def handle(request: httpx.Request) -> httpx.Response:
            body = json.loads(request.content)
            if "tools" in body:
                seen.append(body["messages"][0]["content"])
            return fixtures.handle_request(request)

        return httpx.MockTransport(handle)

    monkeypatch.setattr(fixture_provider, "fixture_transport", capturing)
    return seen


def test_the_agent_prompt_teaches_tools_training_diagnosis_clearances_guidance_and_tone(
    copilot, project_id, monkeypatch, tmp_path, systems
):
    script(monkeypatch, tmp_path, default=[answering("Hola.")])
    say(copilot, project_id, "por qué no aprende?")
    system = " ".join(systems[0].split())
    assert "Try every change before you propose it" in system and "look at the changed area" in system
    assert "Finish every turn with the answer tool" in system
    assert "train tool only when the person's latest message asks for it" in system
    assert "No training has run for this project yet" in system and "recommended_steps" in system
    assert "2 or 3 significant figures" in system and '"size"' in system and "randomize" in system
    assert "language of the person's message" in system and "plain everyday words" in system
    assert "would you like something like this, or like that?" in system and "SCR-TRAIN" in system
    assert "Autonomy: ask" in system and '"latest_run":"No training has run for this project yet"' in system
