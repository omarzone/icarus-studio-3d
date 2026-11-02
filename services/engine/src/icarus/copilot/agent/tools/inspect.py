import json
from typing import Any, Literal

from pydantic import Field

from icarus.contracts.training import MetricPoint
from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TurnScope
from icarus.copilot.context import NO_RUN, object_detail, run_facts
from icarus.copilot.step_words import step_said
from icarus.projects.document import all_objects

CURVE_POINTS = 20
IDS_LISTED = 60

type RunSection = Literal["status", "evaluations", "reward_terms", "curve", "failures"]


def compact(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def known_ids(scope: TurnScope) -> str:
    project = scope.state.project
    ids = [body.id for body in project.bodies] + [obj.id for obj in all_objects(project)]
    shown = ", ".join(ids[:IDS_LISTED])
    return f"{shown} (and {len(ids) - IDS_LISTED} more)" if len(ids) > IDS_LISTED else shown


class InspectArgs(ToolArgs):
    object: str = Field(description="Id of a world object, a body part or a body, as listed in the project context.")


def inspect_object(scope: TurnScope, args: InspectArgs) -> Observation:
    body = next((item for item in scope.state.project.bodies if item.id == args.object), None)
    if body is not None:
        parts = [object_detail(scope.state, obj.id) for obj in body.objects]
        detail = {"body": body.id, "name": body.name, "parts": parts}
        return Observation(compact(detail), summary=step_said("inspected", scope.language, name=body.name))
    found = object_detail(scope.state, args.object)
    if found is None:
        text = f"There is no object or body `{args.object}`. Valid ids: {known_ids(scope)}"
        return Observation(text, ok=False, summary=step_said("object_missing", scope.language, name=args.object[:60]))
    return Observation(compact(found), summary=step_said("inspected", scope.language, name=found["name"]))


class ReadRunArgs(ToolArgs):
    run: str = Field(default="latest", description='"latest", or a run name or id from this project.')
    sections: list[RunSection] = Field(
        default=["status", "evaluations", "reward_terms", "curve", "failures"],
        max_length=5,
        description="Which parts of the run to read; ask for fewer to keep the answer short.",
    )


def _curve(points: list[MetricPoint]) -> list[dict[str, Any]]:
    evaluations = [point for point in points if point.kind == "eval"] or [p for p in points if p.kind == "train"]
    stride = max(1, -(-len(evaluations) // CURVE_POINTS))
    return [
        {"step": point.step, "episode_return": point.episode_return, "success_rate": point.success_rate}
        for point in evaluations[::stride]
    ]


def read_run(scope: TurnScope, args: ReadRunArgs) -> Observation:
    runs = scope.services.runs
    statuses = runs.list_runs(scope.project_id)
    if not statuses:
        return Observation(NO_RUN, summary=step_said("no_runs", scope.language), run_facts=True)
    wanted = args.run.strip().lower()
    status = statuses[0] if wanted in ("", "latest") else None
    status = status or next((s for s in statuses if wanted in (s.run_id.lower(), s.name.lower())), None)
    if status is None:
        names = ", ".join(item.name for item in statuses[:10])
        return Observation(
            f"There is no run `{args.run}`. Runs: {names}", ok=False, summary=step_said("run_missing", scope.language)
        )
    facts = run_facts(scope.state, runs, status)
    picked: dict[str, Any] = {"name": facts["name"]}
    if "status" in args.sections:
        keys = ("state", "revision", "step", "total_steps", "recommended_steps", "far_below_recommended", "copies")
        keys += ("control_rate_hz",)
        picked |= {key: facts[key] for key in (*keys, "best_step", "success_rate")}
    if "evaluations" in args.sections:
        picked |= {"evaluations": facts["evaluations"], "latest_evaluation": facts["latest_evaluation"]}
    if "reward_terms" in args.sections:
        latest = facts["latest_training"] or facts["latest_evaluation"] or {}
        picked["reward_terms"] = latest.get("reward_terms")
        picked["episode_length"] = latest.get("episode_length")
        picked["episode_seconds"] = latest.get("episode_seconds")
    if "curve" in args.sections:
        picked["curve"] = _curve(runs.folder(status.run_id).metrics())
    if "failures" in args.sections:
        latest = facts["latest_training"] or {}
        picked |= {"failure": facts["failure"], "failure_rate": latest.get("failure_rate")}
    return Observation(compact(picked), summary=step_said("run_read", scope.language, name=status.name), run_facts=True)


INSPECT_OBJECT = Tool(
    name="inspect_object",
    description=(
        "Read one object or body in full: every component with its values and its property schema (unit, min, "
        "max, options, hint). Use it before changing something whose values are not in the project context."
    ),
    args=InspectArgs,
    step="inspect",
    effect="read",
    run=inspect_object,
    per_turn=None,
    timeout_s=5,
)

READ_RUN = Tool(
    name="read_run",
    description=(
        "Read a training run of this project: status, recent evaluations, reward terms, the learning curve and "
        f"failures. Answers {NO_RUN!r} when nothing has trained. Use it before explaining how training went."
    ),
    args=ReadRunArgs,
    step="inspect",
    effect="read",
    run=read_run,
    per_turn=None,
    timeout_s=5,
)
