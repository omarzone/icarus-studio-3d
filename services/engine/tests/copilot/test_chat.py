import pytest

from icarus.contracts.copilot import CopilotProposal, SendMessage
from icarus.contracts.operations import OperationBatch, SetProperty
from icarus.contracts.properties import NumberValue, SliderValue
from icarus.copilot.chat import Copilot, ProposalClosed, ProposalOutdated, UnknownProposal
from icarus.copilot.conversation_store import ConversationStore
from icarus.copilot.grounding import UNSUPPORTED_ANSWER
from icarus.copilot.settings import ModelSettingsStore
from icarus.projects.store import ProjectStore
from icarus.training.run_store import RunStore


@pytest.fixture
def store(tmp_path) -> ProjectStore:
    return ProjectStore(tmp_path / "projects")


@pytest.fixture
def copilot(tmp_path, store) -> Copilot:
    return Copilot(
        store, RunStore(tmp_path / "runs"), ConversationStore(tmp_path / "projects"), ModelSettingsStore(tmp_path)
    )


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
