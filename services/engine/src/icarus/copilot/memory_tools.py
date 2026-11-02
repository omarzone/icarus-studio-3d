from typing import Any, Literal

from pydantic import Field

from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TurnScope
from icarus.copilot.language import Language
from icarus.copilot.memory import FACT_CHARS, CopilotMemory, MemorySource, memory_prompt, said_by_person
from icarus.copilot.settings import settings_dir
from icarus.training.run_store import RunStore

RECALL_LIMIT = 10
_SAID: dict[str, dict[Language, str]] = {
    "remembered": {"en": "Remembered: {fact}", "es": "Lo recordaré: {fact}"},
    "not_remembered": {"en": "Could not remember that", "es": "No pude guardar ese recuerdo"},
    "recalled": {"en": "Recalled {count} notes", "es": "Recordé {count} notas"},
}


def said(key: str, language: Language, **values: object) -> str:
    return _SAID[key][language].format(**values)[:200]


def memory_of(scope: TurnScope) -> CopilotMemory:
    """The memory beside this turn's projects, with person facts in the engine's data folder."""
    return CopilotMemory(scope.services.projects.root, settings_dir())


def turn_memory(scope: TurnScope, message: str) -> str:
    """The memory section of this turn's system prompt."""
    return memory_prompt(memory_of(scope).turn_facts(scope.project_id, message))


def find_run(runs: RunStore, project_id: str, wanted: str) -> str | None:
    """A run id of this project from "latest", a run name ("Run 2") or an id."""
    statuses = runs.list_runs(project_id)
    key = wanted.strip().lower()
    if key in ("", "latest"):
        return statuses[0].run_id if statuses else None
    return next((status.run_id for status in statuses if key in (status.run_id.lower(), status.name.lower())), None)


class RememberArgs(ToolArgs):
    fact: str = Field(min_length=1, max_length=FACT_CHARS, description="One short fact worth keeping, in words.")
    source: Literal["run", "revision", "message"] = Field(
        description="Where it comes from: a run of this project, a revision, or what the person said."
    )
    run: str | None = Field(default=None, description='For a run source: "latest", a run name or a run id.')
    step: int | None = Field(default=None, ge=0, description="For a run source: the checkpoint step it is about.")
    revision: int | None = Field(default=None, ge=1, description="For a revision source: the revision number.")
    about: Literal["project", "person"] = Field(
        default="project",
        description="person only for preferences the person stated in this message, in their own words.",
    )


def _source(scope: TurnScope, args: RememberArgs) -> MemorySource | str:
    """The fact's source checked against the project, or why it cannot be one."""
    if args.about == "person" and args.source != "message":
        return "Person facts only come from what the person said; use source message."
    if args.about == "person" and not said_by_person(args.fact, scope.request):
        return "A person fact must use the person's own words from this message."
    match args.source:
        case "run":
            run_id = find_run(scope.services.runs, scope.project_id, args.run or "latest")
            if run_id is None:
                names = ", ".join(status.name for status in scope.services.runs.list_runs(scope.project_id)[:10])
                return f"There is no run `{args.run}` in this project. Runs: {names or 'none'}"
            return MemorySource(kind="run", id=run_id, step=args.step)
        case "revision":
            current = scope.state.revision.number
            if args.revision is None or args.revision > current:
                return f"Name a revision from 1 to {current}."
            return MemorySource(kind="revision", id=str(args.revision))
        case "message":
            words = " ".join(scope.request.split())[:80] or "chat"
            return MemorySource(kind="message", id=words)


def remember(scope: TurnScope, args: RememberArgs) -> Observation:
    source = _source(scope, args)
    if isinstance(source, str):
        return Observation(source, ok=False, summary=said("not_remembered", scope.language))
    project_id = None if args.about == "person" else scope.project_id
    fact = memory_of(scope).remember(project_id, args.fact, source)
    text = f"Remembered as fact {fact.id} ({fact.scope})."
    return Observation(text, summary=said("remembered", scope.language, fact=fact.text[:120]))


class RecallArgs(ToolArgs):
    query: str = Field(default="", max_length=200, description="Words to look for; empty brings the newest notes.")
    limit: int = Field(default=5, ge=1, le=RECALL_LIMIT)


def recall(scope: TurnScope, args: RecallArgs) -> Observation:
    facts = memory_of(scope).recall(scope.project_id, args.query, args.limit)
    text = memory_prompt(facts) or "Nothing remembered matches that."
    return Observation(text, summary=said("recalled", scope.language, count=len(facts)))


REMEMBER = Tool(
    name="remember",
    description=(
        "Keep a fact that is expensive to rediscover (what worked, what broke, a preference the person stated) with "
        "its source: a run and step, a revision, or the person's message. Not for numbers you have not read."
    ),
    args=RememberArgs,
    step="inspect",
    effect="write",
    run=remember,
    per_turn=3,
    timeout_s=5,
)

RECALL = Tool(
    name="recall",
    description=(
        "Look up remembered notes about this project and the person. Notes are not a source for numbers: read a "
        "number again from its run or revision before citing it."
    ),
    args=RecallArgs,
    step="inspect",
    effect="read",
    run=recall,
    per_turn=3,
    timeout_s=5,
)

MEMORY_TOOLS: dict[str, Tool[Any]] = {tool.name: tool for tool in (REMEMBER, RECALL)}
