import json
import sys
from collections.abc import Iterator

import httpx
import pytest

from icarus.contracts.copilot import SendMessage
from icarus.contracts.operations import OperationBatch, SetBrain
from icarus.contracts.training import StartRun, WarmStart
from icarus.copilot import fixture_provider
from icarus.copilot.attachments import AttachmentStore
from icarus.copilot.chat import Copilot
from icarus.copilot.chat_training import ChatTrainer, TrainingRequest
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
    assert [(step.tool, step.summary) for step in answer.steps] == [("train", "Ofrecí un botón para entrenar")]


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


def test_a_brain_with_its_own_training_steps_trains_that_long_by_default(
    copilot, store, runs, project_id, monkeypatch, tmp_path
):
    longer = SetBrain(op="set_brain", training_steps=50_000)
    store.apply(project_id, OperationBatch(operations=[longer], summary="Shorter practice"))
    script(monkeypatch, tmp_path, default=[tool_step("train", action="start"), answering("Ok.")])
    copilot.set_autonomy(project_id, "autopilot")
    say(copilot, project_id, "entrénalo")
    (run,) = runs.list_runs(project_id)
    assert run.total_steps == 50_000


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


CONTINUE = tool_step("train", action="start", total_steps=10_000, copies=1, continue_from_best=True)


def test_asking_to_continue_from_the_best_brain_starts_a_warm_run_even_in_ask_mode(
    copilot, store, runs, project_id, monkeypatch, tmp_path
):
    script(monkeypatch, tmp_path, default=[CONTINUE, answering("Continuing.")])
    earlier = runs.create(store.state(project_id), StartRun(total_steps=10_000, copies=1), threads=1)
    folder = runs.folder(earlier.run_id)
    folder.checkpoint_path(25_000).write_bytes(b"brain")
    folder.write_status(folder.stored_status().model_copy(update={"state": "done", "best_step": 25_000}))

    say(copilot, project_id, "train again from the best brain")

    latest = runs.list_runs(project_id)[0]
    assert latest.run_id != earlier.run_id
    assert runs.folder(latest.run_id).config().warm_start == WarmStart(run_id=earlier.run_id, step=25_000)


def test_continuing_without_a_trained_brain_says_so(copilot, runs, project_id, monkeypatch, tmp_path):
    script(monkeypatch, tmp_path, default=[CONTINUE, answering("Continuing.")])

    answer = say(copilot, project_id, "train again from the best brain")

    assert runs.list_runs(project_id) == [] and "no trained brain to continue from" in answer.text


class RecordingSupervisor(Supervisor):
    def __init__(self, runs: RunStore) -> None:
        super().__init__(runs)
        self.started: list[StartRun] = []

    def start(self, state, start, threads, use_graphics_card):
        self.started.append(start)
        return self.store.create(state, start, threads)


def test_runs_the_chat_starts_are_coached_unless_the_person_asks_otherwise(tmp_path, store, runs, project_id):
    supervisor = RecordingSupervisor(runs)
    trainer = ChatTrainer(store, runs, supervisor, TrainingSettingsStore(tmp_path / "runs", tmp_path / "projects"))
    trainer.act(project_id, TrainingRequest(action="start", total_steps=10_000, copies=1))
    trainer.act(project_id, TrainingRequest(action="start", total_steps=10_000, copies=1, coach=False))
    assert [start.coach for start in supervisor.started] == [True, False]


def test_the_copilot_pauses_and_resumes_the_run_training(tmp_path, store, runs, supervisor, project_id):
    trainer = ChatTrainer(store, runs, supervisor, TrainingSettingsStore(tmp_path / "runs", tmp_path / "projects"))
    assert not trainer.act(project_id, TrainingRequest(action="pause")).acted
    trainer.act(project_id, TrainingRequest(action="start", total_steps=10_000, copies=1))
    run = runs.list_runs(project_id)[0]
    wait_for(state_is(runs, run.run_id, "running"))
    paused = trainer.act(project_id, TrainingRequest(action="pause"))
    assert paused.acted and "paused" in paused.text and runs.folder(run.run_id).status().paused
    resumed = trainer.act(project_id, TrainingRequest(action="resume"))
    assert resumed.acted and not runs.folder(run.run_id).status().paused
