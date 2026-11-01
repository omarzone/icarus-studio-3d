from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.design import DesignReport
from icarus.contracts.operations import EditOperation
from icarus.contracts.specs import BodySpec, BrainSpec, RewardTermSpec, TaskFamily, TaskSpec, WorldSpec


class Project(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str = Field(min_length=1, max_length=80)
    schema_version: Literal[1]
    world: WorldSpec
    bodies: list[BodySpec]
    task: TaskSpec
    brain: BrainSpec


class Revision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    number: int = Field(ge=1)
    parent: int | None
    author: Literal["user", "copilot"]
    summary: str
    operations: list[EditOperation]
    created_at: datetime


class ProjectSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    revision: int
    updated_at: datetime


class ProjectState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    project: Project
    revision: Revision
    report: DesignReport
    can_undo: bool
    can_redo: bool


class CreateProject(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)
    template: str


__all__ = [
    "BodySpec",
    "BrainSpec",
    "CreateProject",
    "Project",
    "ProjectState",
    "ProjectSummary",
    "RewardTermSpec",
    "Revision",
    "TaskFamily",
    "TaskSpec",
    "WorldSpec",
]
