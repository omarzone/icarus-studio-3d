from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.play import PlayReading
from icarus.contracts.specs import BrainStart


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class NetworkInput(_Model):
    index: int = Field(ge=0)
    # What this observation value means ("Front sensor distance 1", "Goal distance").
    label: str = Field(max_length=120)
    # The sensor it comes from, when it comes from one.
    sensor: str | None = None


class NetworkLayer(_Model):
    name: str = Field(max_length=60)
    size: int = Field(ge=1)
    activation: str = Field(max_length=40)


class NetworkOutput(_Model):
    index: int = Field(ge=0)
    label: str = Field(max_length=120)
    # The actuator this action drives.
    actuator: str | None = None


class BrainNetwork(_Model):
    """The policy network of a checkpoint, with its inputs and outputs named after the body."""

    run_id: str
    step: int = Field(ge=0)
    inputs: list[NetworkInput]
    layers: list[NetworkLayer]
    outputs: list[NetworkOutput]


class BrainActivations(_Model):
    """What every neuron of a checkpoint's policy computes for the first observation of an evaluation episode."""

    run_id: str
    step: int = Field(ge=0)
    observation_labels: list[str]
    observation: list[float]
    layers: list[list[float]]
    outputs: list[float]


class BrainReadings(_Model):
    """What a checkpoint's brain senses and does at one moment of its first evaluation episode, as MuJoCo computed."""

    run_id: str
    step: int = Field(ge=0)
    # Simulated time into the episode when the readings were taken.
    seconds: float = Field(ge=0)
    senses: list[PlayReading]
    actions: list[PlayReading]


class BrainBehavior(_Model):
    """One way the evaluation episodes of a checkpoint went, with how many of them went that way."""

    id: str
    name: str
    detail: str
    episodes: int = Field(ge=0)
    of: int = Field(ge=1)
    # Mean simulated time at which it happened, when it happens at a moment.
    seconds: float | None = None


class BrainBehaviors(_Model):
    run_id: str
    step: int = Field(ge=0)
    behaviors: list[BrainBehavior]


class TrainedSize(_Model):
    """A finished run of the project that trained a brain with this size."""

    run_id: str
    run_name: str
    minutes: float = Field(ge=0)
    steps: int = Field(ge=0)
    success_rate: float | None = None


class BrainSizeOption(_Model):
    id: str
    label: str
    layers: list[int]
    recommended: bool
    current: bool
    # The newest finished run of this project with this size, when there is one.
    trained: TrainedSize | None = None


class BrainSizes(_Model):
    project_id: str
    senses: int = Field(ge=0)
    motors: int = Field(ge=0)
    sizes: list[BrainSizeOption]


class BrainSourceOption(_Model):
    """A trained checkpoint, of this project or another one, the body could start from."""

    run_id: str
    step: int = Field(ge=0)
    project_id: str
    project_name: str
    run_name: str
    success_rate: float | None = None
    fits: bool
    # Why it cannot drive this body, when it does not fit.
    reason: str | None = None


class BrainSources(_Model):
    project_id: str
    senses: int = Field(ge=0)
    motors: int = Field(ge=0)
    selected: BrainStart | None = None
    options: list[BrainSourceOption]
