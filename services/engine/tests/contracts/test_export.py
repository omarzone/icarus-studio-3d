from icarus.contracts.export import build_schema


def test_schema_lists_every_contract_and_forbids_extra_fields():
    defs = build_schema()["$defs"]
    assert {"HealthStatus", "ApiError"} <= set(defs)
    assert defs["HealthStatus"]["additionalProperties"] is False
