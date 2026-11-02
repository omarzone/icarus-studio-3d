"""The use_skill tool: the copilot reads a skill's procedure on demand; the loop registers it beside its own tools."""

from functools import cache

from pydantic import Field

from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TurnScope
from icarus.copilot.language import Language
from icarus.copilot.skills.loader import BUILTIN_FOLDER, MAX_SKILL_CHARS, SkillSet, UnknownSkill, load_skills

SKILL_TOOL = "use_skill"

_READ: dict[Language, str] = {"en": "Read the guide “{title}”", "es": "Leí la guía «{title}»"}
_MISSING: dict[Language, str] = {"en": "Looked for a guide that does not exist", "es": "Busqué una guía que no existe"}

CATALOG_PREAMBLE = (
    "Skills: written procedures for kinds of jobs. When the person's request matches one, call use_skill with its "
    "name before you design, and follow its numbered steps as this turn's checklist."
)


def known_tool_names() -> frozenset[str]:
    """The tools a skill may name: the agent's registry plus use_skill itself."""
    # Imported here: the registry will hold use_skill, so importing it at load time would be circular.
    from icarus.copilot.agent.tools import REGISTRY

    return frozenset(REGISTRY) | {SKILL_TOOL}


@cache
def builtin_skills() -> SkillSet:
    return load_skills([BUILTIN_FOLDER], known_tool_names())


class UseSkillArgs(ToolArgs):
    name: str = Field(min_length=1, max_length=64, description="The name of a skill from the skills list.")


def skill_catalog_text(skills: SkillSet | None = None) -> str:
    """The prompt's few lines about skills: one per skill with its name, title and when to use it."""
    lines = (builtin_skills() if skills is None else skills).catalog()
    return "\n".join([CATALOG_PREAMBLE, *(f"- {line}" for line in lines)])


def use_skill_tool(skills: SkillSet | None = None) -> Tool[UseSkillArgs]:
    """The tool over one set of skills; none means the built-in ones."""

    def run(scope: TurnScope, args: UseSkillArgs) -> Observation:
        available = builtin_skills() if skills is None else skills
        try:
            skill = available.get(args.name)
        except UnknownSkill as error:
            return Observation(str(error.args[0]), ok=False, summary=_MISSING[scope.language])
        return Observation(skill.observation(), summary=_READ[scope.language].format(title=skill.title))

    return Tool(
        name=SKILL_TOOL,
        description=(
            "Read a skill: the step-by-step procedure for a kind of job (from the skills list), with the checks and "
            "what done means. Call it before designing when a skill matches the request."
        ),
        args=UseSkillArgs,
        step="library",
        effect="read",
        run=run,
        per_turn=2,
        timeout_s=5,
        # A skill is read whole: per_turn × this stays within one step's budget, so fit_step never cuts it.
        observation_chars=MAX_SKILL_CHARS + 2_000,
    )


USE_SKILL = use_skill_tool()
