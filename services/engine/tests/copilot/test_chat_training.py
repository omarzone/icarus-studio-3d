import json
import sys
from collections.abc import Iterator

import httpx
import pytest

from icarus.contracts.copilot import SendMessage
from icarus.contracts.training import StartRun
from icarus.copilot import chat
from icarus.copilot.attachments import AttachmentStore
from icarus.copilot.chat import Copilot
from icarus.copilot.chat_training import ChatTrainer
from icarus.copilot.client import Connection, ModelClient
from icarus.copilot.conversation_store import ConversationStore
from icarus.copilot.settings import ModelSettingsStore
from icarus.projects.store import ProjectStore
from icarus.training.run_store import RunStore
from icarus.training.settings import TrainingSettingsStore
from icarus.training.supervisor import Supervisor
from tests.training.test_supervisor import FAKE_WORKER, state_is, wait_for

START = {"action": "start", "total_steps": 10_000, "copies": 1}


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


def model_answering(monkeypatch, replies: dict[str, dict], systems: list[str] | None = None) -> None:
    """A model whose reply is chosen by a word in the person's message."""

    def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if systems is not None:
            systems.append(body["messages"][0]["content"])
        text = body["messages"][1]["content"].lower()
        reply = next(reply for word, reply in replies.items() if word in text)
        content = {"proposal": None, "suggestions": [], "training": None, **reply}
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(content)}}]})

    client = ModelClient(Connection("http://fixtures.invalid/v1", "", "fixtures"), httpx.MockTransport(handle))
    monkeypatch.setattr(chat, "copilot_client", lambda settings: client)


TRAIN_AND_STOP = {
    "entr": {"answer": "Vamos a entrenarlo.", "training": START},
    "stop": {"answer": "Stopping it.", "training": {"action": "stop"}},
}


def say(copilot: Copilot, project_id: str, text: str) -> str:
    return copilot.send(project_id, SendMessage(text=text, selection=None, workspace="Train")).messages[-1].text


def test_asking_to_train_starts_a_run_and_asking_to_stop_stops_it(copilot, runs, project_id, monkeypatch):
    model_answering(monkeypatch, TRAIN_AND_STOP)
    answer = say(copilot, project_id, "entrénalo")
    (run,) = runs.list_runs(project_id)
    assert answer.startswith("Vamos a entrenarlo.") and run.name in answer
    assert run.total_steps == 10_000 and run.copies == 1
    wait_for(state_is(runs, run.run_id, "running"))

    answer = say(copilot, project_id, "stop")
    assert run.name in answer
    wait_for(state_is(runs, run.run_id, "stopped"))


def test_asking_to_train_while_a_run_trains_says_that_one_is_running(
    copilot, store, runs, supervisor, project_id, monkeypatch
):
    model_answering(monkeypatch, TRAIN_AND_STOP)
    running = supervisor.start(store.state(project_id), StartRun(total_steps=10_000, copies=1), 1, False)
    answer = say(copilot, project_id, "entrénalo otra vez")
    assert f"{running.name} is already training" in answer
    assert [run.run_id for run in runs.list_runs(project_id)] == [running.run_id]


def test_training_defaults_come_from_the_recommended_budget_and_the_brain(
    copilot, store, runs, project_id, monkeypatch
):
    model_answering(monkeypatch, {"entr": {"answer": "Ok.", "training": {"action": "start"}}})
    say(copilot, project_id, "entrénalo")
    (run,) = runs.list_runs(project_id)
    assert run.total_steps == 1_000_000 and run.copies == store.state(project_id).project.brain.copies


def test_a_project_without_a_task_is_not_trained_and_the_answer_says_why(copilot, store, runs, monkeypatch):
    project_id = store.create("Empty", "empty_world").project.id
    model_answering(monkeypatch, TRAIN_AND_STOP)
    answer = say(copilot, project_id, "entrénalo")
    assert runs.list_runs(project_id) == [] and "did not start training" in answer


def test_stopping_with_nothing_training_says_so(copilot, project_id, monkeypatch):
    model_answering(monkeypatch, TRAIN_AND_STOP)
    assert "nothing to stop" in say(copilot, project_id, "stop")


def test_the_chat_prompt_teaches_training_grounded_diagnosis_clearances_and_tone(copilot, project_id, monkeypatch):
    systems: list[str] = []
    model_answering(monkeypatch, {"": {"answer": "Hola."}}, systems)
    say(copilot, project_id, "por qué no aprende?")
    system = " ".join(systems[0].split())
    assert '"training"' in system and "Never tell the person to press Train" in system
    assert "No training has run for this project yet" in system and "no training has run yet" in system
    assert "2 or 3 significant figures" in system and "recommended_steps" in system
    assert '"size"' in system and '"warnings"' in system
    assert "language of the person's message" in system and "plain everyday words" in system
    assert "Autonomy: ask" in system
