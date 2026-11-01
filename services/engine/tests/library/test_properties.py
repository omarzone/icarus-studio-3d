from icarus.contracts.properties import ChoiceValue, CountValue, NumberValue, SwitchValue
from icarus.library.components import component_kind
from icarus.library.properties import check_value


def schema(kind: str, prop: str):
    return next(item for item in component_kind(kind).properties if item.id == prop)


def test_negative_mass_names_the_unit_and_range():
    message = check_value(schema("physics_body", "mass"), NumberValue(type="number", value=-1))
    assert message is not None
    assert "kg" in message
    assert "0.001" in message


def test_choice_outside_its_options_is_refused():
    assert check_value(schema("joint", "kind"), ChoiceValue(type="choice", value="rubber")) is not None


def test_a_value_of_another_type_is_refused():
    assert check_value(schema("physics_body", "mass"), SwitchValue(type="switch", value=True)) is not None


def test_ray_count_below_one_is_refused():
    assert check_value(schema("distance_ray", "count"), CountValue(type="count", value=0)) is not None
