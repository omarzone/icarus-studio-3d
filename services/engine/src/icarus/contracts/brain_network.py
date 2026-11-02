from pydantic import BaseModel, ConfigDict, Field


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
