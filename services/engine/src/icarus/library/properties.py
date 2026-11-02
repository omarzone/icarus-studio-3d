from icarus.contracts.properties import (
    AssetValue,
    ChoiceValue,
    ColorValue,
    CountValue,
    ListValue,
    NumberValue,
    PropertyOption,
    PropertySchema,
    PropertyValue,
    RangeValue,
    SliderValue,
    SwitchValue,
    VectorValue,
)

Vector3 = tuple[float, float, float]


def number(
    id: str,
    label: str,
    unit: str,
    lo: float,
    hi: float,
    default: float,
    *,
    expert: bool = False,
    hint: str | None = None,
) -> PropertySchema:
    return PropertySchema(
        id=id,
        label=label,
        type="number",
        unit=unit,
        min=lo,
        max=hi,
        default=NumberValue(type="number", value=default),
        expert=expert,
        hint=hint,
    )


def slider(
    id: str,
    label: str,
    lo: float,
    hi: float,
    step: float,
    default: float,
    *,
    expert: bool = False,
    randomizable: bool = False,
    unit: str | None = None,
) -> PropertySchema:
    return PropertySchema(
        id=id,
        label=label,
        type="slider",
        unit=unit,
        min=lo,
        max=hi,
        step=step,
        default=SliderValue(type="slider", value=default),
        expert=expert,
        randomizable=randomizable,
    )


def span(id: str, label: str, unit: str, lo: float, hi: float, default: tuple[float, float]) -> PropertySchema:
    return PropertySchema(
        id=id,
        label=label,
        type="range",
        unit=unit,
        min=lo,
        max=hi,
        default=RangeValue(type="range", low=default[0], high=default[1]),
    )


def choice(id: str, label: str, options: list[str], default: str, *, hint: str | None = None) -> PropertySchema:
    return PropertySchema(
        id=id,
        label=label,
        type="choice",
        options=[PropertyOption(value=option, label=option.capitalize()) for option in options],
        default=ChoiceValue(type="choice", value=default),
        hint=hint,
    )


def listing(id: str, label: str, options: list[str], default: str, *, hint: str | None = None) -> PropertySchema:
    return PropertySchema(
        id=id,
        label=label,
        type="list",
        options=[PropertyOption(value=option, label=option.capitalize()) for option in options],
        default=ListValue(type="list", value=default),
        hint=hint,
    )


def switch(id: str, label: str, default: bool, *, hint: str | None = None) -> PropertySchema:
    return PropertySchema(
        id=id, label=label, type="switch", default=SwitchValue(type="switch", value=default), hint=hint
    )


def color(id: str, label: str, default: str, *, hint: str | None = None) -> PropertySchema:
    return PropertySchema(id=id, label=label, type="color", default=ColorValue(type="color", value=default), hint=hint)


def vector(
    id: str, label: str, unit: str | None, lo: float, hi: float, default: Vector3, *, hint: str | None = None
) -> PropertySchema:
    return PropertySchema(
        id=id,
        label=label,
        type="vector",
        unit=unit,
        min=lo,
        max=hi,
        default=VectorValue(type="vector", value=default),
        hint=hint,
    )


def count(id: str, label: str, lo: int, hi: int, default: int) -> PropertySchema:
    return PropertySchema(
        id=id, label=label, type="count", min=lo, max=hi, default=CountValue(type="count", value=default)
    )


def reference(id: str, label: str, hint: str) -> PropertySchema:
    """An object id; empty means none."""
    return PropertySchema(id=id, label=label, type="asset", default=AssetValue(type="asset", value=""), hint=hint)


def _bounds(schema: PropertySchema) -> str:
    unit = f" {schema.unit}" if schema.unit else ""
    return f"between {schema.min:g} and {schema.max:g}{unit}"


def _outside(schema: PropertySchema, number: float) -> bool:
    return (schema.min is not None and number < schema.min) or (schema.max is not None and number > schema.max)


def check_value(schema: PropertySchema, value: PropertyValue) -> str | None:
    """Why a value does not fit its schema, or None when it does."""
    if value.type != schema.type:
        return f"{schema.label} takes a {schema.type} value, not a {value.type}"
    match value:
        case NumberValue() | SliderValue() | CountValue():
            if _outside(schema, value.value):
                return f"{schema.label} must be {_bounds(schema)}"
        case RangeValue():
            if value.low > value.high:
                return f"{schema.label} starts above where it ends"
            if _outside(schema, value.low) or _outside(schema, value.high):
                return f"{schema.label} must stay {_bounds(schema)}"
        case VectorValue():
            if any(_outside(schema, item) for item in value.value):
                return f"Every axis of {schema.label} must be {_bounds(schema)}"
        case ChoiceValue() | ListValue():
            if schema.options is not None and value.value not in {option.value for option in schema.options}:
                return f"{schema.label} has no option {value.value!r}"
        case _:
            pass
    return None
