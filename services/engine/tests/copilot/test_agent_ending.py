import pytest

from icarus.contracts.copilot import SendMessage
from icarus.copilot.agent.ending import listed_options
from icarus.copilot.attachments import AttachmentStore
from icarus.copilot.chat import Copilot
from icarus.copilot.chat_training import ChatTrainer, TrainerReply, TrainingRequest
from icarus.copilot.conversation_store import ConversationStore
from icarus.copilot.language import Language
from icarus.copilot.settings import ModelSettingsStore
from icarus.projects.store import ProjectStore
from icarus.sim.views import ViewRenderer
from icarus.training.run_store import RunStore
from tests.copilot.test_agent_loop import NIGHT_OPS, answer_call, call, make_copilot, model, say


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
def copilot(tmp_path, store, settings, views) -> Copilot:
    return make_copilot(tmp_path, store, settings, views)


@pytest.fixture
def project_id(store) -> str:
    return store.create("Parking", "parking_car").project.id


TRY_NIGHT = {"tool_calls": [call("try", {"operations": NIGHT_OPS, "look": None})]}
PROPOSE_NIGHT = {
    "tool_calls": [call("propose", {"try_id": "t1", "summary": "Noche", "explanation": "Baja el sol.", "warnings": []})]
}
OBJECTS = ["ground", "sun", "spawn", "sky", "car", "steer_left", "wheel_front_left", "steer_right", "goal"]


def inspecting(body: dict) -> dict:
    steps = sum(1 for message in body["messages"] if message["role"] == "assistant")
    return {"tool_calls": [call("inspect_object", {"object": OBJECTS[steps % len(OBJECTS)]})]}


def test_the_step_limit_text_follows_the_persons_language_when_the_wrap_up_fails(copilot, project_id, monkeypatch):
    model(monkeypatch, [inspecting])
    assert say(copilot, project_id, "revisa todo el coche por favor").text.startswith(
        "Llegué al límite de 10 pasos para un mensaje"
    )


def test_a_wrap_up_that_only_proposes_gets_one_more_call_for_its_summary(copilot, project_id, monkeypatch):
    def work(body: dict) -> dict:
        last = str(body["messages"][-1]["content"])
        if body.get("tool_choice") == {"type": "function", "function": {"name": "answer"}}:
            return answer_call("Preparé la noche: revisa el cambio y pulsa Aplicar.")
        if last.startswith("[Engine note] You have reached"):
            return PROPOSE_NIGHT
        if sum(1 for message in body["messages"] if message["role"] == "assistant") == 0:
            return TRY_NIGHT
        return inspecting(body)

    model(monkeypatch, [work])
    conversation = copilot.send(project_id, SendMessage(text="hazlo de noche"))
    answer = conversation.messages[-1]
    assert answer.text == "Preparé la noche: revisa el cambio y pulsa Aplicar."
    assert conversation.proposals[0].status == "open" and answer.proposal_id == conversation.proposals[0].id
    assert [action.label for action in answer.actions][:2] == ["Aplicar", "Descartar"]


def test_only_sentences_with_unbacked_numbers_leave_the_answer_and_the_proposal_stays(copilot, project_id, monkeypatch):
    inventing = answer_call("Propongo bajar el sol. Así gana un 73% más de luna. ¿Lo aplicas?")
    bodies = model(monkeypatch, [TRY_NIGHT, PROPOSE_NIGHT, inventing, inventing])
    conversation = copilot.send(project_id, SendMessage(text="hazlo de noche"))
    assert conversation.messages[-1].text == "Propongo bajar el sol. ¿Lo aplicas?"
    assert conversation.proposals[0].status == "open"
    retry = str(bodies[3]["messages"][-1]["content"])
    assert "Rewrite only those sentences" in retry and "do not shorten" in retry


def test_an_answer_that_claims_a_proposed_change_was_made_is_sent_back_then_corrected(copilot, project_id, monkeypatch):
    claiming = answer_call("Ya lo arreglé: el sol brilla menos.")
    bodies = model(monkeypatch, [TRY_NIGHT, PROPOSE_NIGHT, claiming, claiming])
    answer = say(copilot, project_id, "arréglalo")
    assert "says the change was made" in str(bodies[3]["messages"][-1]["content"])
    assert answer.text.startswith("Todavía no cambié el proyecto: te propuse el cambio y Aplicar lo añade.")


def test_listed_options_become_send_buttons_and_results_screens_are_not_offered(copilot, project_id, monkeypatch):
    options = "¿Qué prefieres?\n\n1. **Entrenar ahora**\n2. **Verlo en 3D** antes de entrenar\n3. Hacerlo más fácil"
    results = [{"label": "Resultados", "kind": "navigate", "target": "SCR-RESULTS"}]
    bodies = model(monkeypatch, [answer_call(options, actions=results), answer_call(options)])
    answer = say(copilot, project_id, "hola")
    assert "SCR-RESULTS" in str(bodies[1]["messages"][-1]["content"])
    assert [(action.kind, action.target) for action in answer.actions] == [
        ("send", "Entrenar ahora"),
        ("send", "Verlo en 3D"),
        ("send", "Hacerlo más fácil"),
    ]


def test_run_codes_reach_the_person_as_plain_words(copilot, project_id, monkeypatch):
    model(monkeypatch, [answer_call("Estado: `starting`. Su tarea es `navigation` y no tiene distance_ray.")])
    assert say(copilot, project_id, "¿cómo va?").text == (
        "Estado: arrancando. Su tarea es llegar a una meta y no tiene rayos de distancia."
    )


def test_a_new_proposal_retires_the_open_one_from_the_previous_message(copilot, project_id, monkeypatch):
    model(monkeypatch, [TRY_NIGHT, PROPOSE_NIGHT, answer_call("Propuesto.")])
    say(copilot, project_id, "hazlo de noche")
    model(monkeypatch, [TRY_NIGHT, PROPOSE_NIGHT, answer_call("Propuesto otra vez.")])
    conversation = copilot.send(project_id, SendMessage(text="otra vez de noche"))
    assert [proposal.status for proposal in conversation.proposals] == ["outdated", "open"]


class _Trainer:
    def __init__(self) -> None:
        self.started: list[str] = []

    def act(self, project: str, request: TrainingRequest, language: Language = "en") -> TrainerReply:
        self.started.append(request.action)
        return TrainerReply("Empecé Run 1: 1.000.000 pasos con 16 copias.", True)


@pytest.fixture
def autopilot(tmp_path, store, settings, views, project_id) -> tuple[Copilot, _Trainer]:
    trainer = _Trainer()
    projects = tmp_path / "projects"
    built = Copilot(
        store,
        RunStore(tmp_path / "runs"),
        ConversationStore(projects),
        settings,
        trainer,  # type: ignore[arg-type]
        AttachmentStore(projects),
        views,
    )
    built.set_autonomy(project_id, "autopilot")
    return built, trainer


def test_autopilot_applies_its_open_proposal_and_trains_when_asked_to_fix_it(autopilot, store, project_id, monkeypatch):
    built, trainer = autopilot
    bodies = model(monkeypatch, [TRY_NIGHT, PROPOSE_NIGHT, answer_call("Bajé el sol.")])
    conversation = built.send(project_id, SendMessage(text="arréglalo tú"))
    assert store.state(project_id).revision.number == 2
    assert [proposal.status for proposal in conversation.proposals] == ["applied"]
    assert trainer.started == ["start"]
    assert "Empecé Run 1" in conversation.messages[-1].text
    assert "never ask the person to press Apply" in bodies[0]["messages"][0]["content"]


def test_autopilot_does_not_train_when_the_person_only_asked_a_question(autopilot, store, project_id, monkeypatch):
    built, trainer = autopilot
    model(monkeypatch, [TRY_NIGHT, PROPOSE_NIGHT, answer_call("Así se vería de noche.")])
    built.send(project_id, SendMessage(text="¿cómo se vería de noche?"))
    assert store.state(project_id).revision.number == 2 and trainer.started == []


def test_the_trainer_speaks_the_persons_language(store):
    trainer = ChatTrainer(store, None, None, None)  # type: ignore[arg-type]
    empty = store.create("Empty", "empty_world").project.id
    assert trainer.act(empty, TrainingRequest(action="start"), "es").text.startswith("No empecé a entrenar")


def test_an_answer_that_says_press_apply_with_nothing_proposed_is_sent_back_then_corrected(
    copilot, project_id, monkeypatch
):
    pressing = answer_call('Te preparo la meta y los sensores. Si le das a "Aplicar", luego podrás entrenar.')
    bodies = model(monkeypatch, [pressing, pressing])
    answer = say(copilot, project_id, "quiero una carrera")
    assert "no open proposal" in str(bodies[1]["messages"][-1]["content"])
    assert answer.text.startswith("Todavía no hay ningún cambio listo")
    assert "Aplicar" not in answer.text and "Te preparo la meta y los sensores." in answer.text
    assert [action.kind for action in answer.actions if action.kind in ("apply", "discard")] == []


def test_an_answer_that_says_it_proposed_a_change_that_does_not_exist_is_sent_back(copilot, project_id, monkeypatch):
    claimed = answer_call("I proposed a finish line and rays. Check it below.")
    fixed = answer_call("I can add a finish line and rays. Should I prepare it?")
    bodies = model(monkeypatch, [claimed, fixed])
    answer = say(copilot, project_id, "make it a race")
    assert "no open proposal" in str(bodies[1]["messages"][-1]["content"])
    assert answer.text == "I can add a finish line and rays. Should I prepare it?"


QA_OPTIONS = """¿Quieres que lo mejoremos en 2 pasos antes de entrenar?

**Opción A (recomendada para carrera):** Ponerle 3 ojos al frente para que vea las vallas a distancia.
**Opción B:** Cambiar la tarea para que gane un premio grande al llegar a la meta verde.
**Opción C:** Entrenar así como está y ver qué pasa (será más difícil para él).

¿qué prefieres hacer?"""


def test_bold_option_lines_from_a_real_answer_become_send_buttons():
    options = listed_options(QA_OPTIONS)
    assert [label for label, _ in options] == [
        "Ponerle 3 ojos al frente para que vea las vallas a distancia",
        "Cambiar la tarea para que gane un premio grande al llegar a",
        "Entrenar así como está y ver qué pasa",
    ]
    assert options[0][1] == "Opción A: Ponerle 3 ojos al frente para que vea las vallas a distancia."
    assert all(len(label) <= 60 for label, _ in options)


def test_option_headings_and_english_options_become_send_buttons_and_never_more_than_four():
    headings = "Te propongo:\n\n### Opción 1: Pista corta\nDiez metros.\n\n### Opción 2: Pista larga\nVeinte metros."
    assert listed_options(headings) == [
        ("Pista corta", "Opción 1: Pista corta"),
        ("Pista larga", "Opción 2: Pista larga"),
    ]
    english = "\n".join(f"**Option {n}:** Plan number {n}" for n in range(1, 6))
    assert [label for label, _ in listed_options(english)] == [f"Plan number {n}" for n in range(1, 5)]
    assert listed_options("**Opción A:** solo una") == []


def test_pointing_to_apply_is_fine_while_an_earlier_message_still_has_an_open_proposal(
    copilot, project_id, monkeypatch
):
    model(monkeypatch, [TRY_NIGHT, PROPOSE_NIGHT, answer_call("Propongo bajar el sol.")])
    say(copilot, project_id, "hazlo de noche")
    pointing = answer_call("Sigue pendiente la noche: si le das a **Aplicar** se añade.")
    bodies = model(monkeypatch, [pointing])
    answer = say(copilot, project_id, "muéstrame una foto")
    assert len(bodies) == 1 and answer.text == "Sigue pendiente la noche: si le das a **Aplicar** se añade."
