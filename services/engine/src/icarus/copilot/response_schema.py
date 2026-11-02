from typing import Any

from pydantic import BaseModel

# Keywords OpenAI strict mode rejects; Pydantic still enforces them when it validates the answer.
_DROPPED = frozenset(
    {
        "title",
        "default",
        "discriminator",
        "minLength",
        "maxLength",
        "format",
        "examples",
        "uniqueItems",
        "propertyNames",
        "minProperties",
        "maxProperties",
        "patternProperties",
    }
)
_SCHEMA_MAPS = frozenset({"properties", "$defs"})
_NOT_SCHEMAS = frozenset({"enum", "const", "default", "examples", "required", "discriminator"})


def _is_open_map(node: dict[str, Any]) -> bool:
    extra = node.get("additionalProperties")
    untyped = node.get("type") == "object" and "properties" not in node and extra is None
    return extra is True or isinstance(extra, dict) or untyped


def _has_open_map(node: Any) -> bool:
    if isinstance(node, list):
        return any(_has_open_map(item) for item in node)
    if not isinstance(node, dict):
        return False
    if _is_open_map(node):
        return True
    return any(
        _has_open_map(list(value.values()) if key in _SCHEMA_MAPS else value)
        for key, value in node.items()
        if key not in _NOT_SCHEMAS
    )


def _nullable(schema: dict[str, Any]) -> dict[str, Any]:
    variants = schema.get("anyOf")
    if isinstance(variants, list) and {"type": "null"} in variants:
        return schema
    return {"anyOf": [schema, {"type": "null"}]}


def _strict(node: Any) -> Any:
    if isinstance(node, list):
        return [_strict(item) for item in node]
    if not isinstance(node, dict):
        return node
    out: dict[str, Any] = {}
    for key, value in node.items():
        if key in _DROPPED:
            continue
        if key in _SCHEMA_MAPS:
            out[key] = {name: _strict(sub) for name, sub in value.items()}
        elif key == "oneOf":
            out["anyOf"] = _strict(value)
        elif key == "const":
            out["enum"] = [value]
        elif key == "prefixItems":
            # Tuples become arrays of a fixed length; Pydantic checks each position afterwards.
            variants = [_strict(item) for item in value]
            unique = [item for index, item in enumerate(variants) if item not in variants[:index]]
            out["items"] = unique[0] if len(unique) == 1 else {"anyOf": unique}
            out.setdefault("minItems", len(value))
            out.setdefault("maxItems", len(value))
        elif key in ("enum", "required"):
            out[key] = value
        else:
            out[key] = _strict(value)
    if not _is_open_map(node) and ("properties" in out or out.get("type") == "object"):
        properties: dict[str, Any] = out.setdefault("properties", {})
        out["additionalProperties"] = False
        # Strict mode wants every property listed; an optional one that defaults to None may then be null.
        for name, original in node.get("properties", {}).items():
            if (
                name not in node.get("required", [])
                and isinstance(original, dict)
                and original.get("default", 0) is None
            ):
                properties[name] = _nullable(properties[name])
        out["required"] = list(properties)
    return out


def response_schema(output: type[BaseModel]) -> tuple[dict[str, Any], bool]:
    """The output's JSON Schema in the form strict structured outputs accept, and whether strict mode can hold it.

    Maps (objects keyed by name) cannot be expressed in strict mode, so a schema that has them is sent non-strict.
    An optional property with a non-null default becomes required: the model gives a value, Pydantic checks it.
    """
    original = output.model_json_schema()
    strict = not _has_open_map(original)
    return _strict(original), strict
