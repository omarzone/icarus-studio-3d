from pathlib import Path

import pytest

from icarus.copilot.skills.loader import (
    MAX_SKILL_CHARS,
    MAX_STEPS,
    InvalidSkill,
    UnknownSkill,
    load_skills,
    parse_skill,
)

KNOWN_TOOLS = frozenset({"library", "try", "look", "propose"})

GOOD = """---
name: walking-robot
title: Design a robot that learns to walk
when: The person wants legs or a walker.
tools: [library, try, look, propose]
version: 2
---
Some context before the steps.

1. **Body.** Torso and two legs.
   Keep the hips level.
2. Sensors: balance on the torso. Touch on each foot.
3. **Check feet**: try, then look from the side.

Done when the feet rest on the ground.
"""


def _skill(**fields: str) -> str:
    values = {
        "name": "a-skill",
        "title": "A skill",
        "when": "Always.",
        "tools": "[try]",
        "version": "1",
    } | fields
    header = "\n".join(f"{key}: {value}" for key, value in values.items() if value != "-")
    return f"---\n{header}\n---\n1. Do it.\n"


def test_front_matter_and_numbered_steps_become_a_skill_with_a_checklist():
    skill = parse_skill(GOOD, "walking-robot.md", KNOWN_TOOLS)

    assert (skill.name, skill.title, skill.version) == ("walking-robot", "Design a robot that learns to walk", 2)
    assert skill.when == "The person wants legs or a walker."
    assert skill.tools == ("library", "try", "look", "propose")
    assert skill.checklist == ("Body", "Sensors: balance on the torso", "Check feet")
    assert skill.body.startswith("Some context") and "Keep the hips level." in skill.body
    assert "Design a robot that learns to walk" in skill.observation()
    assert "1. **Body.**" in skill.observation()


@pytest.mark.parametrize(
    ("text", "reason"),
    [
        ("1. No front matter.\n", "front matter"),
        (_skill(color="red"), "unknown field 'color'"),
        (_skill(title="-"), "missing field 'title'"),
        (_skill(tools="[try, fly]"), "unknown tool 'fly'"),
        (_skill(tools="try"), "tools"),
        (_skill(version="two"), "version"),
        (_skill(version="0"), "version"),
        (_skill(version="²"), "version"),
        (_skill(version="١"), "version"),
        (_skill(name="Walking Robot"), "name"),
        (_skill(name="a-skill\nname: twice"), "twice"),
        ("---\nname: a\ntitle: A\nwhen: W\ntools: [try]\nversion: 1\n---\nNo steps at all.\n", "numbered steps"),
        ("---\nname: a\ntitle: A\nwhen: W\ntools: [try]\nversion: 1\n---\n1. One\n3. Three\n", "numbered 1"),
        (_skill().replace("1. Do it.\n", "".join(f"{n}. Do {n}.\n" for n in range(1, MAX_STEPS + 2))), "steps"),
    ],
)
def test_an_invalid_skill_says_why(text, reason):
    with pytest.raises(InvalidSkill, match=reason):
        parse_skill(text, "bad.md", KNOWN_TOOLS)


def test_a_skill_past_the_size_limit_is_rejected():
    with pytest.raises(InvalidSkill, match="characters"):
        parse_skill(_skill() + "x" * MAX_SKILL_CHARS, "big.md", KNOWN_TOOLS)


def test_loading_skips_invalid_skills_with_a_reason_and_the_first_folder_wins_a_name(tmp_path: Path):
    builtin, community = tmp_path / "builtin", tmp_path / "community"
    builtin.mkdir()
    community.mkdir()
    (builtin / "good.md").write_text(GOOD, encoding="utf-8")
    (builtin / "broken.md").write_text(_skill(tools="[teleport]"), encoding="utf-8")
    (builtin / "odd.md").write_text(_skill(name="odd", version="²"), encoding="utf-8")
    (community / "same.md").write_text(GOOD.replace("version: 2", "version: 9"), encoding="utf-8")
    (community / "notes.txt").write_text("not a skill", encoding="utf-8")

    skills = load_skills([builtin, community, tmp_path / "missing"], KNOWN_TOOLS)

    assert list(skills.skills) == ["walking-robot"]
    assert skills.get("walking-robot").version == 2
    reasons = {skipped.source.name: skipped.reason for skipped in skills.skipped}
    assert set(reasons) == {"broken.md", "odd.md", "same.md"}
    assert "teleport" in reasons["broken.md"]
    assert "already" in reasons["same.md"]


def test_the_catalog_lists_name_title_and_when_and_unknown_names_are_refused(tmp_path: Path):
    (tmp_path / "good.md").write_text(GOOD, encoding="utf-8")
    skills = load_skills([tmp_path], KNOWN_TOOLS)

    assert skills.catalog() == [
        "walking-robot: Design a robot that learns to walk. Use when: The person wants legs or a walker."
    ]
    with pytest.raises(UnknownSkill, match="walking-robot"):
        skills.get("flying-robot")
