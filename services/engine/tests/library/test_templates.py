import pytest
from pydantic import TypeAdapter

from icarus.contracts.operations import EditOperation, SetRewardTerm
from icarus.library.catalog import library_catalog
from icarus.library.rewards import REWARD_TERMS
from icarus.library.templates import TEMPLATES, UnknownTemplate, template_operations

OPERATIONS = TypeAdapter(list[EditOperation])


@pytest.mark.parametrize("template", list(TEMPLATES))
def test_template_operations_are_valid_edit_operations(template):
    operations = template_operations(template)
    assert operations
    OPERATIONS.validate_python(OPERATIONS.dump_python(operations))


@pytest.mark.parametrize("template", list(TEMPLATES))
def test_template_rewards_come_from_the_library_with_weights_in_range(template):
    for operation in template_operations(template):
        if isinstance(operation, SetRewardTerm):
            info = REWARD_TERMS[operation.term.term]
            assert info.weight_min <= operation.term.weight <= info.weight_max


def test_unknown_template_is_refused():
    with pytest.raises(UnknownTemplate):
        template_operations("nope")


def test_catalog_lists_components_rewards_and_templates():
    catalog = library_catalog()
    assert {"motor", "joint"} <= {kind.kind for kind in catalog.components}
    assert {"empty_world", "parking_car", "walker_robot", "humanoid"} == {item.id for item in catalog.templates}
    assert catalog.reward_terms
