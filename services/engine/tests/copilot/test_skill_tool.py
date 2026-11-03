import pytest

from icarus.copilot.agent.budget import AgentLimits
from icarus.copilot.agent.tools import REGISTRY
from icarus.copilot.agent.tools.base import ToolServices, TurnScope, tool_definition
from icarus.copilot.skill_tool import USE_SKILL, UseSkillArgs, builtin_skills, known_tool_names, skill_catalog_text
from icarus.copilot.skills.loader import MAX_SKILL_CHARS, MAX_STEPS, MAX_TITLE_CHARS, parse_skill
from icarus.projects.store import ProjectStore
from icarus.training.run_store import RunStore


@pytest.fixture
def scope(tmp_path) -> TurnScope:
    store = ProjectStore(tmp_path / "projects")
    project_id = store.create("Walker", "empty_world").project.id
    services = ToolServices(store, RunStore(tmp_path / "runs"), None, None, None)  # type: ignore[arg-type]
    return TurnScope(project_id, store.state(project_id), "ask", services, language="es")


def test_using_a_skill_returns_its_whole_body_and_checklist_without_truncation(scope):
    skill = builtin_skills().get("walking-robot")

    seen = USE_SKILL.run(scope, UseSkillArgs(name="walking-robot"))

    assert seen.ok
    assert skill.body in seen.text
    assert "1. Start from the vault or a template" in seen.text
    assert seen.summary == f"Leí la guía «{skill.title}»"
    assert USE_SKILL.effect == "read"
    assert USE_SKILL.observation_chars > MAX_SKILL_CHARS


def test_an_unknown_skill_fails_and_lists_the_skills_that_exist(scope):
    seen = USE_SKILL.run(scope, UseSkillArgs(name="flying-robot"))

    assert not seen.ok
    assert "flying-robot" in seen.text and "walking-robot" in seen.text


def test_the_tool_definition_and_the_prompt_catalog_name_every_builtin_skill():
    definition = tool_definition(USE_SKILL.name, USE_SKILL.description, USE_SKILL.args)
    catalog = skill_catalog_text()

    assert definition["function"]["name"] == "use_skill"
    for name in builtin_skills().skills:
        assert f"- {name}: " in catalog


def test_skills_may_name_exactly_the_registered_tools_and_use_skill():
    assert known_tool_names() == frozenset(REGISTRY) | {"use_skill"}


def test_a_turn_of_the_largest_skills_fits_one_step_so_fit_step_never_cuts_them():
    steps = "".join(f"{n}. **{'s' * 78}** {'x' * 10}\n" for n in range(1, MAX_STEPS + 1))
    tools = ", ".join(sorted(known_tool_names()))
    head = f"---\nname: big\ntitle: {'T' * MAX_TITLE_CHARS}\nwhen: W\ntools: [{tools}]\nversion: 1\n---\n"
    text = head + steps + "y" * (MAX_SKILL_CHARS - len(head) - len(steps))
    largest = parse_skill(text, "big.md", known_tool_names())

    assert len(largest.observation()) <= USE_SKILL.observation_chars
    assert USE_SKILL.per_turn is not None
    assert USE_SKILL.per_turn * USE_SKILL.observation_chars <= AgentLimits().step_observation_chars
