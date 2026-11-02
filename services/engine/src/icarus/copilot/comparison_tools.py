from typing import Any

from pydantic import Field

from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TurnScope
from icarus.copilot.language import Language
from icarus.copilot.memory_tools import find_run
from icarus.copilot.revision_comparison import compare_revisions
from icarus.projects.store import UnknownRevision
from icarus.training.run_comparison import compare_runs

_SAID: dict[str, dict[Language, str]] = {
    "runs_compared": {"en": "Compared {a} with {b}", "es": "Comparé {a} con {b}"},
    "run_missing": {"en": "Could not find that run", "es": "No encontré esa ejecución"},
    "revisions_compared": {"en": "Compared revision {a} with {b}", "es": "Comparé la revisión {a} con la {b}"},
    "revision_missing": {"en": "Could not find that revision", "es": "No encontré esa revisión"},
}


def _said(key: str, language: Language, **values: object) -> str:
    return _SAID[key][language].format(**values)[:200]


class CompareRunsArgs(ToolArgs):
    run_a: str = Field(description='The earlier or baseline run: a run name ("Run 2"), an id or "latest".')
    run_b: str = Field(default="latest", description='The run to compare with it: a name, an id or "latest".')


def compare(scope: TurnScope, args: CompareRunsArgs) -> Observation:
    runs = scope.services.runs
    found = [find_run(runs, scope.project_id, wanted) for wanted in (args.run_a, args.run_b)]
    if found[0] is None or found[1] is None:
        names = ", ".join(status.name for status in runs.list_runs(scope.project_id)[:10]) or "none"
        text = f"Name two runs of this project. Runs: {names}"
        return Observation(text, ok=False, summary=_said("run_missing", scope.language))
    table = compare_runs(runs, found[0], found[1])
    summary = _said("runs_compared", scope.language, a=table.a.name, b=table.b.name)
    return Observation(table.model_dump_json(), summary=summary, run_facts=True)


class CompareRevisionsArgs(ToolArgs):
    a: int = Field(ge=1, description="The earlier revision number.")
    b: int | None = Field(default=None, ge=1, description="The later revision; none means the current one.")


def compare_project_revisions(scope: TurnScope, args: CompareRevisionsArgs) -> Observation:
    later = scope.state.revision.number if args.b is None else args.b
    try:
        changes = compare_revisions(scope.services.projects, scope.project_id, args.a, later)
    except UnknownRevision:
        text = f"Name revisions from 1 to {scope.state.revision.number}."
        return Observation(text, ok=False, summary=_said("revision_missing", scope.language))
    summary = _said("revisions_compared", scope.language, a=args.a, b=later)
    return Observation(changes.model_dump_json(exclude_none=True), summary=summary)


COMPARE_RUNS = Tool(
    name="compare",
    description=(
        "Compare two runs of this project as a table: success, failure, return, episode length and each reward term "
        "at their best checkpoints, plus steps, wall time and the best checkpoint, with differences (b minus a). "
        "It says whether both were evaluated on the same seeds."
    ),
    args=CompareRunsArgs,
    step="inspect",
    effect="read",
    run=compare,
    per_turn=None,
    timeout_s=10,
)

COMPARE_REVISIONS = Tool(
    name="compare_revisions",
    description="What changed in the project between two revisions: objects, components, properties and rewards.",
    args=CompareRevisionsArgs,
    step="inspect",
    effect="read",
    run=compare_project_revisions,
    per_turn=None,
    timeout_s=10,
)

COMPARISON_TOOLS: dict[str, Tool[Any]] = {tool.name: tool for tool in (COMPARE_RUNS, COMPARE_REVISIONS)}
