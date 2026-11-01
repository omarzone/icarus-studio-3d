import json

import httpx
import pytest

from icarus.contracts.copilot import CopilotProposal, SendMessage
from icarus.contracts.operations import OperationBatch, SetProperty
from icarus.contracts.properties import NumberValue, SliderValue
from icarus.copilot import chat
from icarus.copilot.attachments import AttachmentStore
from icarus.copilot.chat import Copilot, ProposalClosed, ProposalOutdated, UnknownProposal
from icarus.copilot.chat_training import ChatTrainer
from icarus.copilot.client import Connection, ModelClient
from icarus.copilot.conversation_store import ConversationStore
from icarus.copilot.fixture_provider import fixture_transport
from icarus.copilot.grounding import UNSUPPORTED_ANSWER
from icarus.copilot.settings import ModelSettingsStore
from icarus.projects.store import ProjectStore
from icarus.training.run_store import RunStore
from icarus.training.settings import TrainingSettingsStore
from icarus.training.supervisor import Supervisor


@pytest.fixture
def store(tmp_path) -> ProjectStore:
    return ProjectStore(tmp_path / "projects")


@pytest.fixture
def copilot(tmp_path, store) -> Copilot:
    runs = RunStore(tmp_path / "runs")
    trainer = ChatTrainer(
        store, runs, Supervisor(runs), TrainingSettingsStore(tmp_path / "runs", tmp_path / "projects")
    )
    projects = tmp_path / "projects"
    settings = ModelSettingsStore(tmp_path)
    return Copilot(store, runs, ConversationStore(projects), settings, trainer, AttachmentStore(projects))


@pytest.fixture
def project_id(store) -> str:
    return store.create("Parking", "parking_car").project.id


def say(copilot: Copilot, project_id: str, text: str, selection: str | None = None):
    return copilot.send(project_id, SendMessage(text=text, selection=selection, workspace="World"))


def only_proposal(conversation) -> CopilotProposal:
    assert len(conversation.proposals) == 1
    return conversation.proposals[0]


def sun_intensity(store: ProjectStore, project_id: str) -> float:
    sun = next(obj for obj in store.state(project_id).project.world.objects if obj.id == "sun")
    light = next(component for component in sun.components if component.kind == "light")
    intensity = light.properties["intensity"]
    assert isinstance(intensity, SliderValue)
    return intensity.value


def test_make_it_night_proposes_a_validated_dimmer_light(copilot, store, project_id):
    conversation = say(copilot, project_id, "make it night")
    proposal = only_proposal(conversation)
    assert proposal.status == "open" and proposal.base_revision == 1
    assert proposal.summary == "Make it night"
    dim = next(change for change in proposal.changes if change.label == "Intensity on Sun")
    assert dim.before == "1" and dim.after == "0.25"
    user, answer = conversation.messages
    assert user.role == "user" and user.text == "make it night"
    assert answer.role == "copilot" and answer.proposal_id == proposal.id and answer.thinking
    assert 1 <= len(conversation.suggestions) <= 3
    assert sun_intensity(store, project_id) == 1
    assert copilot.conversation(project_id) == conversation


def test_applying_a_proposal_creates_a_copilot_revision(copilot, store, project_id):
    proposal = only_proposal(say(copilot, project_id, "make it night"))
    applied = only_proposal(copilot.apply(proposal.id))
    assert applied.status == "applied" and applied.applied_revision == 2
    state = store.state(project_id)
    assert state.revision.author == "copilot" and state.revision.summary == "Make it night"
    assert sun_intensity(store, project_id) == 0.25
    with pytest.raises(ProposalClosed):
        copilot.apply(proposal.id)


def test_a_discarded_proposal_changes_nothing(copilot, store, project_id):
    proposal = only_proposal(say(copilot, project_id, "make it night"))
    assert only_proposal(copilot.discard(proposal.id)).status == "discarded"
    assert store.state(project_id).revision.number == 1
    with pytest.raises(ProposalClosed):
        copilot.apply(proposal.id)


def test_a_proposal_is_outdated_once_the_project_moves_on(copilot, store, project_id):
    proposal = only_proposal(say(copilot, project_id, "make it night"))
    mass = SetProperty(
        op="set_property",
        object="car",
        component="physics_body",
        property="mass",
        value=NumberValue(type="number", value=1000),
    )
    store.apply(project_id, OperationBatch(operations=[mass], summary="Heavier"))
    assert only_proposal(copilot.conversation(project_id)).status == "outdated"
    with pytest.raises(ProposalOutdated):
        copilot.apply(proposal.id)
    with pytest.raises(ProposalOutdated):
        copilot.proposal_scene(proposal.id)


def test_autopilot_applies_a_valid_proposal_at_once(copilot, store, project_id):
    assert copilot.set_autonomy(project_id, "autopilot").autonomy == "autopilot"
    proposal = only_proposal(say(copilot, project_id, "make it night"))
    assert proposal.status == "applied" and proposal.applied_revision == 2
    assert store.state(project_id).revision.author == "copilot"


def test_an_answer_citing_numbers_not_in_the_context_is_replaced(copilot, project_id):
    conversation = say(copilot, project_id, "how well does it park?")
    assert conversation.messages[-1].text == UNSUPPORTED_ANSWER
    assert conversation.proposals == []


def test_an_invalid_proposal_is_answered_in_words_only(copilot, store, project_id):
    conversation = say(copilot, project_id, "make the car heavier")
    assert conversation.proposals == [] and conversation.messages[-1].proposal_id is None
    assert "Mass" in conversation.messages[-1].text
    assert store.state(project_id).revision.number == 1


def test_asking_about_the_selection_explains_it_from_its_values(copilot, project_id):
    answer = say(copilot, project_id, "what does this do?", selection="steer_left").messages[-1]
    assert "35" in answer.text and "2000" in answer.text and answer.proposal_id is None


def test_the_proposal_scene_shows_the_change_before_it_is_applied(copilot, project_id):
    proposal = only_proposal(say(copilot, project_id, "make it night"))
    scene = copilot.proposal_scene(proposal.id)
    ground = next(geom for geom in scene.geoms if geom.name == "ground")
    assert ground.color == "#22252b"
    assert max(light.intensity for light in scene.lights) == pytest.approx(0.25 * 0xFF / 255, abs=0.01)


def test_an_unknown_proposal_is_reported(copilot, project_id):
    with pytest.raises(UnknownProposal):
        copilot.apply(f"{project_id}-00000000")
    with pytest.raises(UnknownProposal):
        copilot.discard("not-a-proposal")


NIGHT = {
    "summary": "Make it night",
    "explanation": "Dims the Sun.",
    "operations": [
        {
            "op": "set_property",
            "object": "sun",
            "component": "light",
            "property": "intensity",
            "value": {"type": "slider", "value": 0.25},
        }
    ],
}


def answer_with(monkeypatch, tmp_path, **fixtures: dict) -> None:
    """Fixtures for the chat role, by file name: each one answers with the given reply."""
    folder = tmp_path / "fixtures" / "chat_reply"
    folder.mkdir(parents=True)
    for name, reply in fixtures.items():
        match = reply.pop("match", [])
        content = {"proposal": None, "suggestions": [], **reply}
        (folder / f"{name}.json").write_text(json.dumps({"match": match, "replies": [{"content": content}]}))
    monkeypatch.setenv("ICARUS_COPILOT_FIXTURES", str(tmp_path / "fixtures"))


def test_only_the_answer_is_replaced_when_only_the_answer_cites_unbacked_numbers(
    copilot, project_id, monkeypatch, tmp_path
):
    answer_with(monkeypatch, tmp_path, default={"answer": "It gets 73.5 lux darker.", "proposal": NIGHT})
    conversation = say(copilot, project_id, "make it night")
    assert conversation.messages[-1].text == UNSUPPORTED_ANSWER
    assert only_proposal(conversation).summary == "Make it night"


def test_a_proposal_whose_explanation_cites_unbacked_numbers_is_left_out(copilot, project_id, monkeypatch, tmp_path):
    explained = {**NIGHT, "explanation": "Dims the Sun to 17.5 lux."}
    answer_with(monkeypatch, tmp_path, default={"answer": "Here is a night version.", "proposal": explained})
    conversation = say(copilot, project_id, "make it night")
    assert conversation.proposals == [] and conversation.messages[-1].proposal_id is None
    assert conversation.messages[-1].text.startswith("Here is a night version.")


def test_suggestions_citing_unbacked_numbers_are_dropped(copilot, project_id, monkeypatch, tmp_path):
    suggestions = ["Make it night?", "Set the mass to 777 kg?"]
    answer_with(monkeypatch, tmp_path, default={"answer": "Ask me anything.", "suggestions": suggestions})
    assert say(copilot, project_id, "hello").suggestions == ["Make it night?"]


def test_numbers_from_earlier_in_the_conversation_are_backed(copilot, project_id, monkeypatch, tmp_path):
    answer_with(
        monkeypatch,
        tmp_path,
        default={"answer": "Noted."},
        recall={"match": ["remember"], "answer": "You said the course is 64.5 m long."},
    )
    say(copilot, project_id, "The course is 64.5 m long.")
    assert say(copilot, project_id, "Do you remember the length?").messages[-1].text.startswith("You said")


def test_a_percentage_backed_only_by_a_library_range_is_replaced(copilot, project_id, monkeypatch, tmp_path):
    answer_with(monkeypatch, tmp_path, default={"answer": "It parks 35% of the time."})
    assert say(copilot, project_id, "how often?").messages[-1].text == UNSUPPORTED_ANSWER
    assert say(copilot, project_id, "would 35% be good?").messages[-1].text == "It parks 35% of the time."


HEAVIER = OperationBatch(
    operations=[
        SetProperty(
            op="set_property",
            object="car",
            component="physics_body",
            property="mass",
            value=NumberValue(type="number", value=1000),
        )
    ],
    summary="Heavier",
)


def test_a_change_that_lands_just_before_applying_outdates_the_proposal(copilot, store, project_id, monkeypatch):
    proposal = only_proposal(say(copilot, project_id, "make it night"))
    refresh = copilot.conversation

    def refresh_then_move(project: str):
        conversation = refresh(project)
        store.apply(project, HEAVIER)
        return conversation

    monkeypatch.setattr(copilot, "conversation", refresh_then_move)
    with pytest.raises(ProposalOutdated):
        copilot.apply(proposal.id)
    monkeypatch.undo()
    assert only_proposal(copilot.conversation(project_id)).status == "outdated"
    assert store.state(project_id).revision.summary == "Heavier"


def test_autopilot_reports_a_proposal_outdated_while_the_model_answered(copilot, store, project_id, monkeypatch):
    fixtures = fixture_transport()

    def move_then_answer(request: httpx.Request) -> httpx.Response:
        if store.state(project_id).revision.number == 1:
            store.apply(project_id, HEAVIER)
        return fixtures.handle_request(request)

    client = ModelClient(
        Connection("http://fixtures.invalid/v1", "", "fixtures"), httpx.MockTransport(move_then_answer)
    )
    monkeypatch.setattr(chat, "copilot_client", lambda settings: client)
    copilot.set_autonomy(project_id, "autopilot")
    conversation = say(copilot, project_id, "make it night")
    assert only_proposal(conversation).status == "outdated"
    assert store.state(project_id).revision.summary == "Heavier"


def test_a_proposal_carries_the_copilots_clearance_warnings(copilot, project_id, monkeypatch, tmp_path):
    warned = {**NIGHT, "warnings": ["The car is wider than the gap between the parked cars."]}
    answer_with(monkeypatch, tmp_path, default={"answer": "Here it is.", "proposal": warned})
    proposal = only_proposal(say(copilot, project_id, "make it night"))
    assert "The car is wider than the gap between the parked cars." in proposal.warnings
