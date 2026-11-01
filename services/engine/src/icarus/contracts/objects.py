from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.properties import PropertyValue


class ComponentSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64)
    kind: str
    properties: dict[str, PropertyValue]


class ObjectSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=80)
    parent: str | None
    components: list[ComponentSpec]
