from typing import Literal

from pydantic import BaseModel, ConfigDict

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.properties import PropertySchema
from icarus.contracts.specs import BodySpec, RewardTermSpec, TaskFamily

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
    # Every task family the term fits; `family` is the one it belongs to first.
    families: list[TaskFamily] = []
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


# Where a piece sits in the library's lists, for the copilot and the library panel.
PieceCategory = Literal["basics", "street", "buildings", "furniture", "nature", "props"]


class PieceInfo(BaseModel):
    """A ready-made object from the library that can be placed in a world."""

    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    icon: str
    description: str
    object: ObjectSpec
    category: PieceCategory = "basics"


class VaultBodyInfo(BaseModel):
    """A ready-made body from the library's vault, added to a project as its agent."""

    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    description: str
    # The task family it is built for and the reward terms, with weights, it suggests for it.
    family: TaskFamily
    rewards: list[RewardTermSpec]
    color: str
    # The body at the origin in its own color, standing on the ground; object ids are unprefixed.
    body: BodySpec


class LibraryCatalog(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: str
    components: list[ComponentKindSpec]
    reward_terms: list[RewardTermInfo]
    templates: list[TemplateInfo]
    pieces: list[PieceInfo] = []
    bodies: list[VaultBodyInfo] = []
    # How the brain practices, as the inspector shows it; ids are the fields of set_brain.
    brain_settings: list[PropertySchema] = []
