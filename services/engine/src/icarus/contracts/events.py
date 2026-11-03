from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.copilot import AgentStep
from icarus.contracts.training import RunEvent

TaskKind = Literal[
    "training_run", "autopilot", "diagnosis", "ideas", "build", "agent_turn", "auto_rig", "pose_tracking"
]
TaskState = Literal["running", "done", "stopped", "failed"]
HookPoint = Literal[
    "turn_start",
    "before_tool",
    "after_tool",
    "before_propose",
    "before_apply",
    "turn_end",
    "before_compact",
    "task_finished",
]
HookAction = Literal["allow", "add_context", "block", "require_approval", "suggest", "run_check"]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class TaskInfo(_Model):
    """One piece of long work the engine is doing or did, listed by GET /tasks."""

    id: str
    project_id: str | None
    kind: TaskKind
    state: TaskState
    progress: float | None = Field(default=None, ge=0, le=1)
    title: str = Field(max_length=200)
    started_at: datetime
    finished_at: datetime | None = None
    parent_task_id: str | None = None


class TurnStartedEvent(_Model):
    type: Literal["turn_started"]
    turn_id: str


class StepEvent(_Model):
    type: Literal["step"]
    turn_id: str
    step: AgentStep


class ViewTakenEvent(_Model):
    type: Literal["view_taken"]
    turn_id: str
    attachment_id: str


class ProposalCreatedEvent(_Model):
    type: Literal["proposal_created"]
    proposal_id: str
    summary: str = Field(max_length=200)


class ProposalAppliedEvent(_Model):
    type: Literal["proposal_applied"]
    proposal_id: str
    revision: int = Field(ge=1)


class TurnFinishedEvent(_Model):
    type: Literal["turn_finished"]
    turn_id: str
    message_id: str | None = None
    ok: bool = True


class TaskStartedEvent(_Model):
    type: Literal["task_started"]
    task: TaskInfo


class TaskProgressEvent(_Model):
    type: Literal["task_progress"]
    task_id: str
    progress: float = Field(ge=0, le=1)
    text: str = Field(max_length=200)


class TaskFinishedEvent(_Model):
    type: Literal["task_finished"]
    task_id: str
    state: Literal["done", "stopped", "failed"]
    reason: str | None = Field(default=None, max_length=400)


class RunEventWrapper(_Model):
    type: Literal["run_event"]
    run_id: str
    event: RunEvent


class DiagnosisCreatedEvent(_Model):
    type: Literal["diagnosis_created"]
    diagnosis_id: str
    run_id: str


class RevisionCreatedEvent(_Model):
    type: Literal["revision_created"]
    revision: int = Field(ge=1)
    author: Literal["user", "copilot"]
    summary: str


class MessagePostedEvent(_Model):
    """A copilot message added to a conversation outside a turn, such as a coach comment or an autopilot step."""

    type: Literal["message_posted"]
    message_id: str
    role: Literal["user", "copilot"]


class HookDecisionEvent(_Model):
    type: Literal["hook_decision"]
    point: HookPoint
    action: HookAction
    reason: str = Field(max_length=400)


EngineEvent = Annotated[
    TurnStartedEvent
    | StepEvent
    | ViewTakenEvent
    | ProposalCreatedEvent
    | ProposalAppliedEvent
    | TurnFinishedEvent
    | TaskStartedEvent
    | TaskProgressEvent
    | TaskFinishedEvent
    | RunEventWrapper
    | DiagnosisCreatedEvent
    | RevisionCreatedEvent
    | HookDecisionEvent
    | MessagePostedEvent,
    Field(discriminator="type"),
]


class EngineEventEnvelope(_Model):
    """One server-sent event of GET /events."""

    id: str
    time: datetime
    project_id: str | None
    event: EngineEvent
