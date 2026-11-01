import base64
import json

import httpx
import pytest

from icarus.contracts.copilot import AttachmentUpload, ModelSettingsPatch, SendMessage
from icarus.copilot import chat, fixture_provider
from icarus.copilot.attachments import AttachmentStore
from icarus.copilot.chat import Copilot
from icarus.copilot.chat_training import ChatTrainer
from icarus.copilot.client import Connection, ModelClient
from icarus.copilot.conversation_store import ConversationStore
from icarus.copilot.grounding import UNSUPPORTED_ANSWER
from icarus.copilot.settings import ModelSettingsStore
from icarus.copilot.turn_media import MAX_TURN_IMAGES
from icarus.projects.store import ProjectStore
from icarus.training.run_store import RunStore
from icarus.training.settings import TrainingSettingsStore
from icarus.training.supervisor import Supervisor

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 16


def encoded(data: bytes) -> str:
    return base64.b64encode(data).decode()


@pytest.fixture
def store(tmp_path) -> ProjectStore:
    return ProjectStore(tmp_path / "projects")


@pytest.fixture
def settings(tmp_path) -> ModelSettingsStore:
    return ModelSettingsStore(tmp_path / "settings")


@pytest.fixture
def attachments(tmp_path) -> AttachmentStore:
    return AttachmentStore(tmp_path / "projects")


@pytest.fixture
def copilot(tmp_path, store, settings, attachments) -> Copilot:
    runs = RunStore(tmp_path / "runs")
    trainer = ChatTrainer(
        store, runs, Supervisor(runs), TrainingSettingsStore(tmp_path / "runs", tmp_path / "projects")
    )
    return Copilot(store, runs, ConversationStore(tmp_path / "projects"), settings, trainer, attachments)


@pytest.fixture
def project_id(store) -> str:
    return store.create("Parking", "parking_car").project.id


@pytest.fixture
def requests(monkeypatch) -> list[dict]:
    """Every chat completion the fixture model service receives, with the host it was sent to."""
    seen: list[dict] = []
    original = fixture_provider.fixture_transport

    def capturing(root=None) -> httpx.MockTransport:
        fixtures = original(root)

        def handle(request: httpx.Request) -> httpx.Response:
            seen.append({"host": request.url.host, **json.loads(request.content)})
            return fixtures.handle_request(request)

        return httpx.MockTransport(handle)

    monkeypatch.setattr(fixture_provider, "fixture_transport", capturing)
    return seen


def add(attachments: AttachmentStore, project_id: str, **fields) -> str:
    upload = AttachmentUpload.model_validate(
        {"name": "car.png", "media_type": "image/png", "kind": "image", "data": encoded(PNG)} | fields
    )
    return attachments.add(project_id, upload).id


def user_content(request: dict) -> str | list[dict]:
    return next(message["content"] for message in request["messages"] if message["role"] == "user")


def test_a_message_with_a_picture_and_a_view_goes_to_the_vision_model_as_content_parts(
    copilot, settings, attachments, project_id, requests
):
    settings.update(ModelSettingsPatch(endpoint="http://vision.invalid/v1", models={"vision": "seer"}))
    picture = add(attachments, project_id)
    view = add(attachments, project_id, name="viewport.jpg", media_type="image/jpeg", kind="view", data=encoded(JPEG))
    conversation = copilot.send(project_id, SendMessage(text="make it night", attachments=[picture], views=[view]))
    request = requests[-1]
    assert request["host"] == "vision.invalid" and request["model"] == "seer"
    parts = user_content(request)
    assert isinstance(parts, list)
    assert parts[0] == {"type": "text", "text": parts[0]["text"]} and "make it night" in parts[0]["text"]
    urls = [part["image_url"]["url"] for part in parts if part["type"] == "image_url"]
    assert urls == [f"data:image/jpeg;base64,{encoded(JPEG)}", f"data:image/png;base64,{encoded(PNG)}"]
    user = conversation.messages[-2]
    assert [item.name for item in user.attachments] == ["viewport.jpg", "car.png"]
    assert conversation.proposals[0].summary == "Make it night"


def test_video_frames_are_sent_as_pictures_up_to_the_turn_limit(copilot, attachments, project_id, requests):
    frames = [encoded(JPEG)] * 12
    video = add(attachments, project_id, name="run.mp4", media_type="video/mp4", kind="video", frames=frames)
    copilot.send(project_id, SendMessage(text="make it night", attachments=[video]))
    parts = user_content(requests[-1])
    assert isinstance(parts, list)
    assert sum(part["type"] == "image_url" for part in parts) == MAX_TURN_IMAGES
    assert "run.mp4" in parts[0]["text"]


def test_a_document_reaches_the_prompt_and_backs_the_numbers_it_holds(
    copilot, store, attachments, project_id, requests, monkeypatch, tmp_path
):
    folder = tmp_path / "fixtures" / "chat_reply"
    folder.mkdir(parents=True)
    reply = {"answer": "Your notes say the lot is 37.5 m long.", "proposal": None, "suggestions": []}
    (folder / "default.json").write_text(json.dumps({"replies": [{"content": reply}]}))
    monkeypatch.setenv("ICARUS_COPILOT_FIXTURES", str(tmp_path / "fixtures"))
    text = "The lot is 37.5 m long."
    document = add(attachments, project_id, name="lot.md", media_type="text/markdown", kind="document", text=text)
    conversation = copilot.send(project_id, SendMessage(text="how long is it?", attachments=[document]))
    assert conversation.messages[-1].text == reply["answer"]
    content = user_content(requests[-1])
    assert isinstance(content, str) and "lot.md" in content and text in content
    without = store.create("Without notes", "parking_car").project.id
    assert copilot.send(without, SendMessage(text="how long is it?")).messages[-1].text == UNSUPPORTED_ANSWER


def test_a_long_document_is_cut_and_the_prompt_says_so(copilot, attachments, project_id, requests):
    text = "word " * 40_000
    document = add(attachments, project_id, name="long.txt", media_type="text/plain", kind="document", text=text)
    copilot.send(project_id, SendMessage(text="hello", attachments=[document]))
    content = user_content(requests[-1])
    assert isinstance(content, str) and "truncated" in content and len(content) < len(text)


def test_a_model_that_cannot_read_pictures_is_answered_in_words(copilot, attachments, project_id, monkeypatch):
    refusing = httpx.MockTransport(
        lambda request: httpx.Response(400, json={"error": {"message": "image input is not supported"}})
    )
    client = ModelClient(Connection("http://text-only.invalid/v1", "", "text-only"), refusing)
    monkeypatch.setattr(chat, "copilot_client", lambda settings: client)
    picture = add(attachments, project_id)
    conversation = copilot.send(project_id, SendMessage(text="what is this?", attachments=[picture]))
    answer = conversation.messages[-1]
    assert answer.role == "copilot" and "Vision" in answer.text and conversation.proposals == []


def test_attachments_of_another_project_are_refused(copilot, store, attachments, project_id):
    other = store.create("Other", "empty_world").project.id
    picture = add(attachments, other)
    with pytest.raises(LookupError):
        copilot.send(project_id, SendMessage(text="what is this?", attachments=[picture]))
