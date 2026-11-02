"""Skills: written procedures the copilot reads on demand, loaded from Markdown with flat front matter."""

import re
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from pathlib import Path

# Small enough that a turn's skills fit one step's observation budget whole.
MAX_SKILL_CHARS = 8_000
MAX_TITLE_CHARS = 120
MAX_WHEN_CHARS = 300
MAX_CHECK_CHARS = 80

MAX_STEPS = 12

BUILTIN_FOLDER = Path(__file__).parent / "builtin"
FIELDS = ("name", "title", "when", "tools", "version")

_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
# ASCII only: str.isdigit accepts digits like '²' that int() then refuses.
_VERSION = re.compile(r"[1-9][0-9]{0,5}")
_STEP = re.compile(r"^(\d+)\.\s+(.+)$")
_BOLD = re.compile(r"^\*\*(.+?)\*\*")


class InvalidSkill(ValueError):
    pass


class UnknownSkill(KeyError):
    pass


@dataclass(frozen=True)
class Skill:
    name: str
    title: str
    when: str
    tools: tuple[str, ...]
    version: int
    body: str
    # Short labels of the numbered steps, in order: the turn's task list.
    checklist: tuple[str, ...]

    def observation(self) -> str:
        """The skill as the model reads it after use_skill."""
        steps = "; ".join(f"{index}. {label}" for index, label in enumerate(self.checklist, 1))
        return (
            f"Skill {self.name} v{self.version}: {self.title}\nTools it uses: {', '.join(self.tools)}\n"
            f"Checklist: {steps}\n\n{self.body}"
        )


@dataclass(frozen=True)
class SkippedSkill:
    source: Path
    reason: str


@dataclass
class SkillSet:
    skills: dict[str, Skill] = field(default_factory=dict)
    skipped: list[SkippedSkill] = field(default_factory=list)

    def get(self, name: str) -> Skill:
        skill = self.skills.get(name)
        if skill is None:
            raise UnknownSkill(f"There is no skill {name!r}; known skills: {', '.join(sorted(self.skills))}")
        return skill

    def catalog(self) -> list[str]:
        """One line per skill for the prompt: name, title and when to use it."""
        return [f"{skill.name}: {skill.title}. Use when: {skill.when}" for skill in self.skills.values()]


def _front_matter(text: str) -> tuple[dict[str, str], str]:
    lines = text.lstrip("﻿").splitlines()
    if not lines or lines[0].strip() != "---":
        raise InvalidSkill("it does not start with front matter between --- lines")
    try:
        end = next(index for index, line in enumerate(lines[1:], 1) if line.strip() == "---")
    except StopIteration as error:
        raise InvalidSkill("its front matter is not closed with a --- line") from error
    fields: dict[str, str] = {}
    for line in lines[1:end]:
        if not line.strip():
            continue
        key, colon, value = line.partition(":")
        key = key.strip()
        if not colon or not key:
            raise InvalidSkill(f"front matter line {line.strip()!r} is not 'field: value'")
        if key not in FIELDS:
            raise InvalidSkill(f"unknown field {key!r}")
        if key in fields:
            raise InvalidSkill(f"field {key!r} appears twice")
        fields[key] = value.strip()
    missing = [key for key in FIELDS if not fields.get(key)]
    if missing:
        raise InvalidSkill(f"missing field {missing[0]!r}")
    return fields, "\n".join(lines[end + 1 :]).strip()


def _tools(raw: str, known: frozenset[str]) -> tuple[str, ...]:
    if not (raw.startswith("[") and raw.endswith("]")):
        raise InvalidSkill("tools must be a list like [try, look, propose]")
    names = tuple(name.strip() for name in raw[1:-1].split(",") if name.strip())
    if not names:
        raise InvalidSkill("tools must name at least one tool")
    for name in names:
        if name not in known:
            raise InvalidSkill(f"unknown tool {name!r}")
    return names


def _label(step: str) -> str:
    bold = _BOLD.match(step)
    label = bold.group(1) if bold else step.split(". ", 1)[0]
    label = label.strip().rstrip(".:").strip()
    return label if len(label) <= MAX_CHECK_CHARS else f"{label[: MAX_CHECK_CHARS - 1].rstrip()}…"


def _checklist(body: str) -> tuple[str, ...]:
    steps = [match for line in body.splitlines() if (match := _STEP.match(line))]
    if not steps:
        raise InvalidSkill("it has no numbered steps")
    if len(steps) > MAX_STEPS:
        raise InvalidSkill(f"it has {len(steps)} steps; a skill has at most {MAX_STEPS}")
    for expected, match in enumerate(steps, 1):
        if int(match.group(1)) != expected:
            raise InvalidSkill(f"its steps must be numbered 1, 2, 3 in order; step {expected} is {match.group(1)}")
    return tuple(_label(match.group(2)) for match in steps)


def parse_skill(text: str, source: str, known_tools: Iterable[str]) -> Skill:
    """A validated skill, or InvalidSkill with the reason; source only names the file in messages."""
    if len(text) > MAX_SKILL_CHARS:
        raise InvalidSkill(f"{source} has {len(text):,} characters; a skill holds at most {MAX_SKILL_CHARS:,}")
    fields, body = _front_matter(text)
    name = fields["name"]
    if not _NAME.match(name):
        raise InvalidSkill(f"name {name!r} must be lowercase words joined by hyphens")
    if len(fields["title"]) > MAX_TITLE_CHARS or len(fields["when"]) > MAX_WHEN_CHARS:
        raise InvalidSkill(f"title is at most {MAX_TITLE_CHARS} and when at most {MAX_WHEN_CHARS} characters")
    version = fields["version"]
    if not _VERSION.fullmatch(version):
        raise InvalidSkill(f"version {version!r} must be a whole number from 1")
    return Skill(
        name=name,
        title=fields["title"].rstrip("."),
        when=fields["when"],
        tools=_tools(fields["tools"], frozenset(known_tools)),
        version=int(version),
        body=body,
        checklist=_checklist(body),
    )


def load_skills(folders: Sequence[Path], known_tools: Iterable[str]) -> SkillSet:
    """Every valid skill in the folders; earlier folders win a name, and each invalid file is skipped with why."""
    known = frozenset(known_tools)
    loaded = SkillSet()
    for folder in folders:
        if not folder.is_dir():
            continue
        for path in sorted(folder.glob("*.md")):
            try:
                skill = parse_skill(path.read_text(encoding="utf-8"), path.name, known)
            except (InvalidSkill, OSError, UnicodeDecodeError) as error:
                loaded.skipped.append(SkippedSkill(path, str(error)))
                continue
            if skill.name in loaded.skills:
                loaded.skipped.append(SkippedSkill(path, f"a skill named {skill.name!r} is already loaded"))
                continue
            loaded.skills[skill.name] = skill
    return loaded
