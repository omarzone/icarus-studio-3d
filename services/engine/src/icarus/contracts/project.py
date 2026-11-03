from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.design import DesignReport
from icarus.contracts.operations import EditOperation
from icarus.contracts.specs import AgentSpec, BodySpec, BrainSpec, RewardTermSpec, TaskFamily, TaskSpec, WorldSpec


class Project(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=300)
    schema_version: Literal[1]
    world: WorldSpec
    bodies: list[BodySpec]
    task: TaskSpec
    brain: BrainSpec
    # Several learners side by side, each training with only its own body; empty for one agent (the first body).
    agents: list[AgentSpec] = Field(default_factory=list)


class Revision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    number: int = Field(ge=1)
    parent: int | None
    author: Literal["user", "copilot"]
    summary: str
    operations: list[EditOperation]
    created_at: datetime
    # The revision whose document this one brings back, when it is a restore.
    restored_from: int | None = None


class ProjectSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    description: str = ""
    revision: int
    updated_at: datetime


class RemixOrigin(BaseModel):
    """The community creation a project was remixed from; publishing the project names it as the original."""

    model_config = ConfigDict(extra="forbid")

    creation_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,32}$")
    version: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=200)


class ProjectState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project: Project
    revision: Revision
    report: DesignReport
    can_undo: bool
    can_redo: bool
    remix_of: RemixOrigin | None = None


class DuplicateProject(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)


class CreateProject(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)
    template: str


__all__ = [
    "AgentSpec",
    "BodySpec",
    "BrainSpec",
    "CreateProject",
    "DuplicateProject",
    "Project",
    "ProjectState",
    "ProjectSummary",
    "RemixOrigin",
    "RewardTermSpec",
    "Revision",
    "TaskFamily",
    "TaskSpec",
    "WorldSpec",
]
