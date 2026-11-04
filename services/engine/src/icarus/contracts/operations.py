from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.motion import MotionReference
from icarus.contracts.objects import ComponentSpec, ObjectSpec
from icarus.contracts.properties import PropertyValue
from icarus.contracts.specs import (
    MAX_CURRICULUM_STAGES,
    AgentSpec,
    BodySpec,
    BrainAlgorithm,
    BrainStart,
    CurriculumStage,
    DecisionsPerSecond,
    EpisodeSeconds,
    LayerSize,
    RewardTermSpec,
    TaskFamily,
    TrainingSteps,
)


class _Operation(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreateObject(_Operation):
    op: Literal["create_object"]
    # "world" or the id of a body.
    target: str
    object: ObjectSpec


class DeleteObject(_Operation):
    op: Literal["delete_object"]
    object: str


class RenameObject(_Operation):
    op: Literal["rename_object"]
    object: str
    name: str = Field(min_length=1, max_length=80)


class ReparentObject(_Operation):
    op: Literal["reparent_object"]
    object: str
    parent: str | None


class AddComponent(_Operation):
    op: Literal["add_component"]
    object: str
    component: ComponentSpec


class RemoveComponent(_Operation):
    op: Literal["remove_component"]
    object: str
    component: str


class SetProperty(_Operation):
    op: Literal["set_property"]
    object: str
    component: str
    property: str
    value: PropertyValue


class AddBody(_Operation):
    op: Literal["add_body"]
    body: BodySpec


class RemoveBody(_Operation):
    op: Literal["remove_body"]
    body: str


class RenameProject(_Operation):
    op: Literal["rename_project"]
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=300)


class SetTaskFamily(_Operation):
    op: Literal["set_task_family"]
    family: TaskFamily
    # The agent whose task this changes, in a project with several; None changes the project's own task.
    agent: str | None = None


class SetRewardTerm(_Operation):
    op: Literal["set_reward_term"]
    term: RewardTermSpec
    # The agent whose task this changes, in a project with several; None changes the project's own task.
    agent: str | None = None


class RemoveRewardTerm(_Operation):
    op: Literal["remove_reward_term"]
    term: str
    # The agent whose task this changes, in a project with several; None changes the project's own task.
    agent: str | None = None


class SetMotionReference(_Operation):
    """Sets or clears (None) the motion an imitation task tracks."""

    op: Literal["set_motion_reference"]
    reference: MotionReference | None
    # The agent whose task this changes, in a project with several; None changes the project's own task.
    agent: str | None = None


class PpoPatch(BaseModel):
    """PPO knobs to change; the ones left out keep their value."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    learning_rate: float | None = Field(default=None, ge=1e-6, le=1e-2)
    n_steps: int | None = Field(default=None, ge=64, le=8192)
    batch_size: int | None = Field(default=None, ge=32, le=65_536)
    n_epochs: int | None = Field(default=None, ge=1, le=50)
    gamma: float | None = Field(default=None, ge=0.8, le=0.9999)
    gae_lambda: float | None = Field(default=None, ge=0.8, le=1.0)
    ent_coef: float | None = Field(default=None, ge=0.0, le=0.1)


class SetBrain(_Operation):
    """Changes the brain and how it practices; fields left out keep their value."""

    op: Literal["set_brain"]
    template: str | None = None
    copies: int | None = Field(default=None, ge=1, le=256)
    seed: int | None = Field(default=None, ge=0)
    algorithm: BrainAlgorithm | None = None
    # "recommended" goes back to the task's recommended budget.
    training_steps: TrainingSteps | Literal["recommended"] | None = None
    # Neurons in each hidden layer, input side first.
    layers: list[LayerSize] | None = None
    ppo: PpoPatch | None = None
    decisions_per_second: DecisionsPerSecond | None = None
    # The whole list of senses and motors left out, as "object/component"; an empty list turns them all back on.
    muted_senses: list[str] | None = Field(default=None, max_length=64)
    muted_motors: list[str] | None = Field(default=None, max_length=64)
    # A trained checkpoint new runs start from; "none" trains from zero again.
    start_from: BrainStart | Literal["none"] | None = None
    # The agent whose brain this changes, in a project with several; None changes the project's own brain.
    agent: str | None = None


class SetEpisode(_Operation):
    """Changes how each try of the task ends; fields left out keep their value."""

    op: Literal["set_episode"]
    seconds: EpisodeSeconds | None = None
    end_on_fall: bool | None = None
    end_on_success: bool | None = None
    # The agent whose task this changes, in a project with several; None changes the project's own task.
    agent: str | None = None


class SetCurriculum(_Operation):
    """Replaces the task's curriculum stages; an empty list goes back to one stage, the task as it is."""

    op: Literal["set_curriculum"]
    stages: list[CurriculumStage] = Field(max_length=MAX_CURRICULUM_STAGES)
    # The agent whose task this changes, in a project with several; None changes the project's own task.
    agent: str | None = None


class AddAgent(_Operation):
    """Adds a learner; with `body` the body is added too. The first agent added to a one-agent project also makes
    its first body an agent, so the agent it had keeps its task and brain."""

    op: Literal["add_agent"]
    agent: AgentSpec
    body: BodySpec | None = None


class RemoveAgent(_Operation):
    """Removes an agent with its body and the world objects only it used; one agent left is the project's again."""

    op: Literal["remove_agent"]
    agent: str


class SetAgent(_Operation):
    """Renames an agent or changes its lane; fields left out keep their value and an empty id clears spawn or goal."""

    op: Literal["set_agent"]
    agent: str
    name: str | None = Field(default=None, min_length=1, max_length=80)
    spawn: str | None = None
    goal: str | None = None
    objects: list[str] | None = None


EditOperation = Annotated[
    CreateObject
    | DeleteObject
    | RenameObject
    | ReparentObject
    | AddComponent
    | RemoveComponent
    | SetProperty
    | AddBody
    | RemoveBody
    | RenameProject
    | SetTaskFamily
    | SetRewardTerm
    | RemoveRewardTerm
    | SetMotionReference
    | SetBrain
    | SetEpisode
    | SetCurriculum
    | AddAgent
    | RemoveAgent
    | SetAgent,
    Field(discriminator="op"),
]


class OperationBatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    operations: list[EditOperation] = Field(min_length=1, max_length=500)
    author: Literal["user", "copilot"] = "user"
    summary: str = Field(min_length=1, max_length=200)
