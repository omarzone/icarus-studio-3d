from icarus.library.catalog import library_catalog
from icarus.library.rewards import term_families


def _set_brain(setting: str, value: float | str) -> dict:
    if setting.startswith("ppo."):
        return {"op": "set_brain", "ppo": {setting.removeprefix("ppo."): value}}
    if setting == "neurons":
        return {"op": "set_brain", "layers": [value]}
    if setting == "layers":
        return {"op": "set_brain", "layers": [256] * int(value)}
    return {"op": "set_brain", setting: value}


def test_every_brain_setting_offers_only_what_set_brain_accepts():
    from pydantic import TypeAdapter, ValidationError

    from icarus.contracts.operations import EditOperation, SetBrain
    from icarus.projects.operations import apply_operations
    from icarus.projects.validation import validate_project
    from tests.sim.conftest import project_from

    adapter = TypeAdapter(EditOperation)
    parking = project_from("parking_car")
    for schema in library_catalog().brain_settings:
        if schema.options is not None:
            for option in schema.options:
                adapter.validate_python(_set_brain(schema.id, option.value))
            continue
        assert schema.min is not None and schema.max is not None, schema.id
        for value in (schema.min, schema.max):
            operation = adapter.validate_python(_set_brain(schema.id, value))
            assert isinstance(operation, SetBrain)
            assert validate_project(apply_operations(parking, [operation])) == [], schema.id
        # Projects may ask for more copies than a run uses; training caps them at MAX_COPIES.
        beyond = (schema.min - 1,) if schema.id == "copies" else (schema.min - 1, schema.max + 1)
        for value in beyond:
            invalid = _set_brain(schema.id, value)
            try:
                operation = adapter.validate_python(invalid)
            except ValidationError:
                continue
            assert validate_project(apply_operations(parking, [operation])), schema.id


def test_catalog_reward_terms_list_every_family_they_fit():
    for info in library_catalog().reward_terms:
        assert info.family in info.families, info.term
        assert set(info.families) == term_families(info.term), info.term


def test_posture_terms_offer_both_families_in_a_stable_order():
    terms = {info.term: info for info in library_catalog().reward_terms}
    assert terms["stay_upright"].families == ["imitation", "locomotion", "navigation"]
    assert terms["forward_progress"].families == ["locomotion"]
