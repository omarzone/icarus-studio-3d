from typing import TypeVar

from icarus.contracts.objects import ComponentSpec, ObjectSpec
from icarus.contracts.properties import (
    AssetValue,
    ChoiceValue,
    ColorValue,
    CountValue,
    ListValue,
    NumberValue,
    PropertyValue,
    RangeValue,
    SliderValue,
    SwitchValue,
    TextValue,
    VectorValue,
)
from icarus.library.components import default_component

Value = TypeVar("Value", bound=PropertyValue)


class ComponentView:
    """Typed reads of one component, falling back to the library default for missing properties."""

    def __init__(self, component: ComponentSpec) -> None:
        self._properties = default_component(component.kind, component.id).properties | component.properties

    def _get(self, prop: str, expected: type[Value]) -> Value:
        value = self._properties[prop]
        if not isinstance(value, expected):
            raise TypeError(f"{prop} is a {value.type} value")
        return value

    def number(self, prop: str) -> float:
        value = self._properties[prop]
        if isinstance(value, NumberValue | SliderValue | CountValue):
            return float(value.value)
        raise TypeError(f"{prop} is a {value.type} value")

    def count(self, prop: str) -> int:
        return self._get(prop, CountValue).value

    def text(self, prop: str) -> str:
        value = self._properties[prop]
        if isinstance(value, ChoiceValue | ListValue | AssetValue | ColorValue | TextValue):
            return value.value
        raise TypeError(f"{prop} is a {value.type} value")

    def switch(self, prop: str) -> bool:
        return self._get(prop, SwitchValue).value

    def vector(self, prop: str) -> tuple[float, float, float]:
        return self._get(prop, VectorValue).value

    def span(self, prop: str) -> tuple[float, float]:
        value = self._get(prop, RangeValue)
        return value.low, value.high


def view(obj: ObjectSpec, kind: str) -> ComponentView | None:
    component = next((item for item in obj.components if item.kind == kind), None)
    return ComponentView(component) if component else None


def components_of(obj: ObjectSpec, kind: str) -> list[ComponentSpec]:
    """Every component of a kind an object can carry more than once, in the object's order."""
    return [item for item in obj.components if item.kind == kind]
