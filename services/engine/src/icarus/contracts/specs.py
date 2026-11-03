from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.motion import MotionReference
from icarus.contracts.objects import ObjectSpec
from icarus.contracts.properties import PropertyValue

TaskFamily = Literal["none", "navigation", "locomotion", "imitation"]


class WorldSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    objects: list[ObjectSpec]


class BodySpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=80)
    objects: list[ObjectSpec]


class RewardTermSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    term: str
    weight: float
    params: dict[str, PropertyValue] = Field(default_factory=dict)


class TaskSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    family: TaskFamily
    rewards: list[RewardTermSpec]
    # The motion an imitation task tracks; None for every other family.
    motion: MotionReference | None = None


# Learning methods the worker really trains with.
BrainAlgorithm = Literal["ppo"]

MIN_TRAINING_STEPS = 10_000
MAX_TRAINING_STEPS = 50_000_000
MAX_LAYERS = 4
MIN_NEURONS = 8
MAX_NEURONS = 1024
LayerSize = Annotated[int, Field(ge=MIN_NEURONS, le=MAX_NEURONS)]
TrainingSteps = Annotated[int, Field(ge=MIN_TRAINING_STEPS, le=MAX_TRAINING_STEPS)]


class PpoSpec(BaseModel):
    """PPO knobs; the defaults are the ones known to train navigation on CPU (ADR 001)."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    learning_rate: float = Field(default=3e-4, ge=1e-6, le=1e-2)
    # Steps each copy collects before every update.
    n_steps: int = Field(default=1024, ge=64, le=8192)
    batch_size: int = Field(default=2048, ge=32, le=65_536)
    n_epochs: int = Field(default=10, ge=1, le=50)
    gamma: float = Field(default=0.99, ge=0.8, le=0.9999)
    gae_lambda: float = Field(default=0.95, ge=0.8, le=1.0)
    # Bonus for trying varied actions.
    ent_coef: float = Field(default=0.0, ge=0.0, le=0.1)


class BrainSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    template: str | None
    copies: int = Field(ge=1, le=256)
    seed: int = Field(ge=0)
    algorithm: BrainAlgorithm = "ppo"
    # Steps a run practices when the request names none; None is the task's recommended budget.
    training_steps: TrainingSteps | None = None
    # Neurons in each hidden layer of the policy and value networks; 1 to MAX_LAYERS layers, checked with the project.
    layers: list[LayerSize] = Field(default_factory=lambda: [256, 256])
    ppo: PpoSpec = Field(default_factory=PpoSpec)


class AgentSpec(BaseModel):
    """One learner of a project with several agents: a body with its own task, brain, start and goal (its lane).

    A project without agents has one, its first body, driven by the project's task and brain."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=80)
    # The body this agent drives.
    body: str = Field(min_length=1, max_length=64)
    # Its own task and brain; None uses the project's.
    task: TaskSpec | None = None
    brain: BrainSpec | None = None
    # The world's spawn point and goal zone objects of its lane; None when it uses the world's own.
    spawn: str | None = None
    goal: str | None = None
    # Other world objects only this agent sees in its physics and displays (its lane's scoreboard, its markers).
    objects: list[str] = Field(default_factory=list)
