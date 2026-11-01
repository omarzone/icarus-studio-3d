from typing import Literal

from pydantic import BaseModel, ConfigDict

from icarus.contracts.properties import PropertySchema
from icarus.contracts.specs import TaskFamily

ComponentGroupName = Literal["Shape", "Physics", "Senses", "Brain", "Learning", "World"]


class ComponentKindSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: str
    label: str
    icon: str
    group: ComponentGroupName
    properties: list[PropertySchema]
    # At most one component of this kind per object.
    unique: bool


class RewardTermInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    term: str
    version: int
    label: str
    family: TaskFamily
    weight_min: float
    weight_max: float
    default_weight: float
    description: str


class TemplateInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    description: str
    family: TaskFamily


class LibraryCatalog(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: str
    components: list[ComponentKindSpec]
    reward_terms: list[RewardTermInfo]
    templates: list[TemplateInfo]
