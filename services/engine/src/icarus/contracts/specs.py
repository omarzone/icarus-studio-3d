from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.properties import PropertyValue

TaskFamily = Literal["none", "navigation", "locomotion"]


class WorldSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    objects: list[ObjectSpec]


class BodySpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=80)
    objects: list[ObjectSpec]


class RewardTermSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    term: str
    weight: float
    params: dict[str, PropertyValue] = Field(default_factory=dict)


class TaskSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    family: TaskFamily
    rewards: list[RewardTermSpec]


class BrainSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    template: str | None
    copies: int = Field(ge=1, le=256)
    seed: int = Field(ge=0)
