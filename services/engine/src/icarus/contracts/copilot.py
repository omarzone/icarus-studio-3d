from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.coach import CoachFinding, FilmStrip
from icarus.contracts.operations import EditOperation
from icarus.contracts.scene import SceneDescription
from icarus.contracts.specs import TaskFamily

Capability = Literal["reasoning", "vision", "image", "pose"]
Autonomy = Literal["ask", "autopilot"]
# A model's context window as the person may set it: from small local models to million-token ones.
MIN_CONTEXT_TOKENS = 4_000
MAX_CONTEXT_TOKENS = 10_000_000
ContextTokens = Annotated[int, Field(ge=MIN_CONTEXT_TOKENS, le=MAX_CONTEXT_TOKENS)]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class ModelConnection(_Model):
    capability: Capability
    # The configured model name, or none when the capability is not set.
    model: str | None
    required: bool
    connected: bool
    # Why it is not connected, in words, when it is not.
    detail: str | None = None
    # The context window the person set for this model, in tokens; none means the engine assumes one.
    context_tokens: int | None = None


class ModelSettings(_Model):
    endpoint: str
    # Last characters of the stored key; the key itself never leaves the engine.
    api_key_hint: str
    connections: list[ModelConnection]


class ModelSettingsPatch(_Model):
    endpoint: str | None = Field(default=None, max_length=500)
    api_key: str | None = Field(default=None, max_length=500)
    models: dict[Capability, str] | None = None
    # A context window per capability in tokens; null clears it back to the assumed one.
    context_tokens: dict[Capability, ContextTokens | None] | None = None


class ProposalChange(_Model):
    # What changes, in words ("Sun brightness on World").
    label: str
    before: str | None = None
    after: str


class CopilotProposal(_Model):
    """Operations the copilot proposes, already validated and compiled against the revision they start from."""

    id: str
    project_id: str
    base_revision: int = Field(ge=1)
    summary: str = Field(min_length=1, max_length=200)
    explanation: str
    operations: list[EditOperation] = Field(min_length=1, max_length=500)
    changes: list[ProposalChange]
    warnings: list[str]
    # "outdated" when the project moved on before the proposal was applied.
    status: Literal["open", "applied", "discarded", "outdated"]
    applied_revision: int | None = None


# "model" is a glTF or GLB file the person adds; it is also stored as a skin of the project (ADR 008).
AttachmentKind = Literal["image", "video", "document", "view", "model"]

# Base64 payloads stay under ~15 MB of file per upload.
MAX_ATTACHMENT_CHARS = 20_000_000


class AttachmentUpload(_Model):
    """A file the person adds to the chat, or a picture of the scene the app renders for the copilot."""

    name: str = Field(min_length=1, max_length=200)
    media_type: str = Field(min_length=1, max_length=100)
    # "view" is a render of the project's scene taken by the app, never a file from the person.
    kind: AttachmentKind
    # The file itself, base64.
    data: str = Field(max_length=MAX_ATTACHMENT_CHARS)
    # Still frames of a video, base64 JPEG or PNG, taken by the app so the copilot can watch it.
    frames: list[str] = Field(default=[], max_length=12)
    # Plain text of a document, read by the app.
    text: str | None = Field(default=None, max_length=200_000)


class AttachmentInfo(_Model):
    id: str
    kind: AttachmentKind
    name: str
    media_type: str
    size: int = Field(ge=0)


class ChatAction(_Model):
    """A button under a copilot answer: what it says and what the app does when it is pressed."""

    label: str = Field(min_length=1, max_length=60)
    # navigate: open a workspace or screen (target is its id); train: start training with the defaults;
    # apply / discard: act on the proposal of this message; send: send `target` as the person's next message.
    kind: Literal["navigate", "train", "apply", "discard", "send", "show", "dismiss", "apply_and_train"]
    target: str | None = Field(default=None, max_length=400)


class CheckItem(_Model):
    """One line of a check list in an answer ("Wheels touch the ground")."""

    text: str = Field(max_length=200)
    tone: Literal["ok", "warn"]


class PlanItem(_Model):
    """One change of a next-step plan the copilot suggests."""

    mark: Literal["add", "change"]
    label: str = Field(max_length=80)
    detail: str = Field(max_length=200)


class RunCard(_Model):
    """A training run the message is about; the app shows its live progress."""

    run_id: str
    # The checkpoint the following messages belong to, when the message marks one ("100k steps").
    milestone_step: int | None = None


SuggestionIntent = Literal[
    "ask", "propose-change", "explain", "diagnose", "compare", "train-run", "stop-run", "play", "show", "share"
]


class ChatSuggestion(_Model):
    text: str = Field(max_length=120)
    # What the chip does: "ask" sends the text; the others also open the screen that answers it.
    intent: SuggestionIntent = "ask"


class AgentStep(_Model):
    """One thing the copilot did before answering, shown so the person can follow its work."""

    tool: Literal["inspect", "look", "try", "propose", "train", "library", "export"]
    # What it did, in words ("Looked at the parking spot from the side").
    summary: str = Field(max_length=200)
    ok: bool = True


class CopilotMessage(_Model):
    id: str
    role: Literal["user", "copilot"]
    text: str
    created_at: datetime
    proposal_id: str | None = None
    # How the copilot thought about it, kept apart from the answer.
    thinking: str | None = None
    attachments: list[AttachmentInfo] = []
    # Buttons offered under this answer; the first is the main one.
    actions: list[ChatAction] = []
    # What the copilot did to reach this answer, in order.
    steps: list[AgentStep] = []
    # A short heading for the answer card.
    title: str | None = Field(default=None, max_length=120)
    checks: list[CheckItem] = Field(default=[], max_length=12)
    plan: list[PlanItem] = Field(default=[], max_length=8)
    # A project build the message follows live.
    build_id: str | None = None
    run: RunCard | None = None
    # The coach's pictures of one episode at a fixed interval.
    film_strip: FilmStrip | None = None
    # What the coach saw the body do, each with the design area to change.
    findings: list[CoachFinding] = Field(default=[], max_length=8)


class Conversation(_Model):
    project_id: str
    messages: list[CopilotMessage]
    proposals: list[CopilotProposal]
    autonomy: Autonomy
    # Short questions the copilot suggests next.
    suggestions: list[str]
    # The same suggestions with what each chip does; empty when only text is known.
    suggestion_items: list[ChatSuggestion] = []


class SendMessage(_Model):
    text: str = Field(min_length=1, max_length=4000)
    # The object selected in the editor, so "this" means something.
    selection: str | None = None
    # The workspace the user is in ("World", "Train", …).
    workspace: str | None = Field(default=None, max_length=40)
    # Uploaded attachments sent with this message, by id.
    attachments: list[str] = Field(default=[], max_length=10)
    # Renders of the scene the app took for this message, so the copilot can see what it edits.
    views: list[str] = Field(default=[], max_length=4)


class SetAutonomy(_Model):
    autonomy: Autonomy


class IdeaRequest(_Model):
    prompt: str = Field(min_length=1, max_length=2000)


class DesignIdea(_Model):
    """One alternative the copilot proposes before building, compiled so its preview is real."""

    id: str
    title: str
    world: str
    body: str
    # What the body learns, in words.
    learns: str
    template: str
    family: TaskFamily
    estimate_minutes: float = Field(ge=0)
    recommended: bool
    scene: SceneDescription


class IdeaSet(_Model):
    id: str
    prompt: str
    ideas: list[DesignIdea]


class BuildIdea(_Model):
    idea_set: str
    idea: str


class BuildStep(_Model):
    id: str
    label: str
    status: Literal["done", "running", "todo"]


class BuildStatus(_Model):
    build_id: str
    # The project once it exists.
    project_id: str | None
    progress: float = Field(ge=0, le=1)
    steps: list[BuildStep]
    # What is happening right now, in words.
    activity: str
    ready: bool
    error: str | None = None
