import re
from typing import get_args

import pytest

from icarus.copilot.agent.tools.inspect import RunSection
from icarus.copilot.agent.tools.look import View
from icarus.copilot.skill_tool import builtin_skills, known_tool_names
from icarus.library.body_vault import VAULT_BODIES
from icarus.library.components import COMPONENTS, SKY_PRESETS, SURFACES
from icarus.library.layouts import RECIPES
from icarus.library.pieces import PIECES
from icarus.library.rewards import REWARD_TERMS
from icarus.library.templates import TEMPLATES
from icarus.sim.start_pose import START_ACROSS, START_HEADING_DEG

EXPECTED = {
    "reach-a-target",
    "walking-robot",
    "avoid-obstacles",
    "reward-design",
    "diagnose-a-brain",
    "curriculum-and-warm-start",
    "environment-look",
    "sensors-for-a-task",
    "about-icarus-studio",
    "watch-a-training",
    "balance-and-stand",
    "push-an-object",
    "jump-and-climb",
    "move-a-joint",
    "build-a-scene",
    "build-an-environment",
    "build-with-parts",
    "clone-from-a-reference",
    "drive-a-vehicle",
    "park-a-vehicle",
    "plates-and-counters",
    "pick-a-body",
    "several-agents",
}
_CODE = re.compile(r"`([^`]+)`")
# A value the skill gives to a reward weight or a property: `term` = 1 or `kind.property` = -20–-10.
_VALUE = re.compile(r"`([a-z_.]+)` = (-?\d+(?:\.\d+)?)(?:–(-?\d+(?:\.\d+)?))?")
_WORDS = (
    set(get_args(View.__value__))
    | set(get_args(RunSection.__value__))
    | set(SKY_PRESETS)
    | set(SURFACES)
    | set(TEMPLATES)
    | set(PIECES)
    | set(RECIPES)
    | set(VAULT_BODIES)
    | {"humanoid_body"}
)
# A step budget next to a percentage reads as a promised result: "300k steps parked 40%".
_PROMISED_RESULT = re.compile(r"\d+(?:k|M)\b[^.]*?\d+%")
SKILLS = sorted(builtin_skills().skills.values(), key=lambda skill: skill.name)


def _range(name: str) -> tuple[float, float] | None:
    if name in REWARD_TERMS:
        return REWARD_TERMS[name].weight_min, REWARD_TERMS[name].weight_max
    kind, _, prop = name.partition(".")
    schema = next(item for item in COMPONENTS[kind].properties if item.id == prop)
    return None if schema.min is None or schema.max is None else (schema.min, schema.max)


def test_the_builtin_skills_load_without_problems():
    assert builtin_skills().skipped == []
    assert set(builtin_skills().skills) == EXPECTED


@pytest.mark.parametrize("skill", SKILLS, ids=lambda skill: skill.name)
def test_a_builtin_skill_names_only_real_tools_library_entries_and_property_ids(skill):
    for token in _CODE.findall(skill.body):
        kind, dot, prop = token.partition(".")
        if dot:
            assert kind in COMPONENTS and prop in {item.id for item in COMPONENTS[kind].properties}, token
        elif token in known_tool_names():
            assert token in skill.tools, f"{token} is used but not listed in tools"
        else:
            assert token in COMPONENTS or token in REWARD_TERMS or token in _WORDS, token


@pytest.mark.parametrize("skill", SKILLS, ids=lambda skill: skill.name)
def test_every_number_a_builtin_skill_sets_lies_inside_the_library_range(skill):
    for name, low, high in _VALUE.findall(skill.body):
        bounds = _range(name)
        assert bounds is not None, name
        for value in (low, high or low):
            assert bounds[0] <= float(value) <= bounds[1], f"{name} = {value} is outside {bounds}"


@pytest.mark.parametrize("skill", SKILLS, ids=lambda skill: skill.name)
def test_a_builtin_skill_ends_with_when_it_is_done_and_has_a_short_checklist(skill):
    assert "Done when" in skill.body
    assert 4 <= len(skill.checklist) <= 8
    assert all(len(label) <= 40 for label in skill.checklist), skill.checklist


@pytest.mark.parametrize("skill", SKILLS, ids=lambda skill: skill.name)
def test_a_builtin_skill_promises_no_success_rate_for_a_step_budget(skill):
    assert not _PROMISED_RESULT.search(skill.body), _PROMISED_RESULT.search(skill.body)


@pytest.mark.parametrize(
    "skill",
    [skill for skill in SKILLS if "spawn_point.random_heading" in skill.body],
    ids=lambda skill: skill.name,
)
def test_a_skill_about_random_heading_says_navigation_already_varies_the_start(skill):
    assert f"±{START_ACROSS:g} m" in skill.body
    assert f"±{START_HEADING_DEG:g}°" in skill.body
    assert "fixed start" not in skill.body
