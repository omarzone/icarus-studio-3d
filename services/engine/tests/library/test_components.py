import re
from pathlib import Path

import pytest

from icarus.contracts.properties import NumberValue, SliderValue, SwitchValue, VectorValue
from icarus.library.components import COMPONENTS, UnknownKind, component_kind, default_component
from icarus.library.properties import check_value

SCENE_PORT = Path(__file__).parents[4] / "apps" / "desktop" / "src" / "renderer" / "ports" / "scene-port.ts"


def desktop_icons() -> set[str]:
    union = re.search(r"export type SceneIcon =(.*?);", SCENE_PORT.read_text(encoding="utf-8"), re.S)
    assert union
    return set(re.findall(r'"([a-z-]+)"', union.group(1)))


def test_every_kind_has_a_label_a_desktop_icon_and_a_group():
    icons = desktop_icons()
    for kind in COMPONENTS.values():
        assert kind.label
        assert kind.icon in icons, kind.kind
        assert kind.properties, kind.kind


@pytest.mark.parametrize(
    ("kind", "prop"),
    [(kind.kind, prop) for kind in COMPONENTS.values() for prop in kind.properties],
    ids=lambda value: value if isinstance(value, str) else value.id,
)
def test_every_default_is_valid_for_its_own_schema(kind, prop):
    assert check_value(prop, prop.default) is None, f"{kind}.{prop.id}"


def test_default_component_carries_every_property():
    component = default_component("motor", "drive")
    assert component.kind == "motor"
    assert set(component.properties) == {prop.id for prop in component_kind("motor").properties}


def test_unknown_kind_is_refused():
    with pytest.raises(UnknownKind):
        component_kind("teleporter")


def test_randomize_per_copy_starts_varying_nothing_and_bounds_each_range():
    kind = component_kind("randomize")
    assert kind.group == "Learning"
    assert kind.unique
    schemas = {prop.id: prop for prop in kind.properties}
    assert set(schemas) == {"position_range", "rotation_range", "color", "friction_spread"}
    defaults = default_component("randomize", "randomize").properties
    assert defaults["position_range"] == VectorValue(type="vector", value=(0, 0, 0))
    assert defaults["rotation_range"] == NumberValue(type="number", value=0)
    assert defaults["color"] == SwitchValue(type="switch", value=False)
    assert defaults["friction_spread"] == SliderValue(type="slider", value=0)
    assert (schemas["position_range"].min, schemas["position_range"].unit) == (0, "m")
    assert (schemas["rotation_range"].max, schemas["rotation_range"].unit) == (180, "deg")
    assert (schemas["friction_spread"].max, schemas["friction_spread"].unit) == (50, "%")
