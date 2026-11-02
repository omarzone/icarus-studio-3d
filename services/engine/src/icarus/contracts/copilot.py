from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.operations import EditOperation
from icarus.contracts.scene import SceneDescription
from icarus.contracts.specs import TaskFamily

Capability = Literal["reasoning", "vision", "image", "pose"]
Autonomy = Literal["ask", "autopilot"]


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


class ModelSettings(_Model):
    endpoint: str
    # Last characters of the stored key; the key itself never leaves the engine.
    api_key_hint: str
    connections: list[ModelConnection]


class ModelSettingsPatch(_Model):
    endpoint: str | None = Field(default=None, max_length=500)
    api_key: str | None = Field(default=None, max_length=500)
    models: dict[Capability, str] | None = None


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


class CopilotMessage(_Model):
    id: str
    role: Literal["user", "copilot"]
    text: str
    created_at: datetime
    proposal_id: str | None = None
    # How the copilot thought about it, kept apart from the answer.
    thinking: str | None = None


class Conversation(_Model):
    project_id: str
    messages: list[CopilotMessage]
    proposals: list[CopilotProposal]
    autonomy: Autonomy
    # Short questions the copilot suggests next.
    suggestions: list[str]


class SendMessage(_Model):
    text: str = Field(min_length=1, max_length=4000)
    # The object selected in the editor, so "this" means something.
    selection: str | None = None
    # The workspace the user is in ("World", "Train", …).
    workspace: str | None = Field(default=None, max_length=40)


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
