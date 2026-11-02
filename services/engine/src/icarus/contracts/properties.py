from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

PropertyType = Literal[
    "number",
    "slider",
    "range",
    "choice",
    "list",
    "switch",
    "color",
    "vector",
    "count",
    "asset",
    "panel",
    "readonly",
    "text",
]

Vector3 = tuple[float, float, float]


class _Value(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class NumberValue(_Value):
    type: Literal["number"]
    value: float


class SliderValue(_Value):
    type: Literal["slider"]
    value: float


class RangeValue(_Value):
    type: Literal["range"]
    low: float
    high: float


class ChoiceValue(_Value):
    type: Literal["choice"]
    value: str


class ListValue(_Value):
    type: Literal["list"]
    value: str


class SwitchValue(_Value):
    type: Literal["switch"]
    value: bool


class ColorValue(_Value):
    type: Literal["color"]
    value: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


class VectorValue(_Value):
    type: Literal["vector"]
    value: Vector3


class CountValue(_Value):
    type: Literal["count"]
    value: int


class AssetValue(_Value):
    type: Literal["asset"]
    value: str


class PanelValue(_Value):
    type: Literal["panel"]
    value: str


class ReadonlyValue(_Value):
    type: Literal["readonly"]
    value: str


# A short name the person types, such as a sensor's own name.
class TextValue(_Value):
    type: Literal["text"]
    value: str = Field(max_length=40)


PropertyValue = Annotated[
    NumberValue
    | SliderValue
    | RangeValue
    | ChoiceValue
    | ListValue
    | SwitchValue
    | ColorValue
    | VectorValue
    | CountValue
    | AssetValue
    | PanelValue
    | ReadonlyValue
    | TextValue,
    Field(discriminator="type"),
]


class PropertyOption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: str
    label: str
    icon: str | None = None


class PropertySchema(BaseModel):
    """How one component property is typed, bounded and shown."""

    model_config = ConfigDict(extra="forbid")

    id: str
    label: str
    type: PropertyType
    unit: str | None = None
    min: float | None = None
    max: float | None = None
    step: float | None = None
    options: list[PropertyOption] | None = None
    default: PropertyValue
    expert: bool = False
    randomizable: bool = False
    hint: str | None = None
