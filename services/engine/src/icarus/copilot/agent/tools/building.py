"""Tools that expand one call into many plain edit operations and try them: patterns, group edits and edits of
every object a filter matches. Their operations are ordinary create_object, set_property and reparent_object, so
proposals, undo and the contract stay the same."""

from collections.abc import Callable

from pydantic import Field

from icarus.contracts.operations import EditOperation
from icarus.contracts.project import Project
from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TurnScope
from icarus.copilot.agent.tools.inspect import compact
from icarus.copilot.agent.tools.trying import MAX_OPERATIONS, LookSpec, base_of, run_try
from icarus.copilot.building.group_edits import GroupChange, PropertyChange, edit_group, edit_matching
from icarus.copilot.building.patterns import PatternSpec, expand_pattern
from icarus.copilot.building.selection import ObjectFilter, matching
from icarus.copilot.step_words import step_said
from icarus.design.compile_error import CompileError
from icarus.design.compiler import CompiledModel, compile_project
from icarus.projects.document import find_object

IDS_SHOWN = 40
type Expand = Callable[[Project, CompiledModel | None, int], tuple[list[EditOperation], dict[str, object]]]


class _BuildArgs(ToolArgs):
    base_try: str | None = Field(default=None, description="A passing try id to build on; none builds on the project.")
    look: LookSpec | None = Field(default=None, description="Also render the candidate from this camera.")


def _build(scope: TurnScope, args: _BuildArgs, expand: Expand, line: Callable[[dict[str, object]], str]) -> Observation:
    failed = step_said("build_failed", scope.language)
    base = base_of(scope, args.base_try)
    if isinstance(base, str):
        return Observation(base, ok=False, summary=failed)
    before, project, compiled = base
    if compiled is None and args.base_try is None:
        try:
            compiled = scope.head_compiled = compile_project(project)
        except CompileError:
            compiled = None
    try:
        operations, facts = expand(project, compiled, MAX_OPERATIONS - len(before))
    except ValueError as error:
        return Observation(f"Nothing was tried: {error}", ok=False, summary=failed)
    if not operations:
        return Observation("Nothing was tried: that changes nothing.", ok=False, summary=failed)
    tried = run_try(scope, [*before, *operations], args.look)
    facts = {"operations": len(operations), **facts}
    summary = f"{line(facts)} · {tried.summary}"[:200]
    return Observation(
        f"Expanded: {compact(facts)}\n{tried.text}",
        ok=tried.ok,
        image=tried.image,
        image_label=tried.image_label,
        summary=summary,
    )


def _shown(ids: list[str]) -> list[str]:
    return ids[:IDS_SHOWN] + ([f"... {len(ids) - IDS_SHOWN} more"] if len(ids) > IDS_SHOWN else [])


def _name(project: Project, object_id: str) -> str:
    found = find_object(project, object_id)
    return found[1].name if found else object_id


class PatternArgs(_BuildArgs):
    pattern: PatternSpec


def pattern(scope: TurnScope, args: PatternArgs) -> Observation:
    name = _name(scope.state.project, args.pattern.source)

    def expand(project: Project, compiled: CompiledModel | None, room: int):
        made = expand_pattern(project, compiled, args.pattern, room)
        facts: dict[str, object] = {"copies": len(made.created), "created": _shown(made.created)}
        if made.skipped:
            facts["skipped"] = made.skipped
        if made.notes:
            facts["notes"] = made.notes
        return made.operations, facts

    def line(facts: dict[str, object]) -> str:
        return step_said("patterned", scope.language, count=facts.get("copies", 0), name=name)

    return _build(scope, args, expand, line)


class GroupArgs(_BuildArgs):
    object: str = Field(description="The group's root; make_group takes any one of the members here.")
    change: GroupChange


def group(scope: TurnScope, args: GroupArgs) -> Observation:
    name = _name(scope.state.project, args.object)

    def expand(project: Project, compiled: CompiledModel | None, room: int):
        edits = edit_group(project, args.object, args.change)
        facts: dict[str, object] = {"touched": _shown(edits.touched)}
        return edits.operations, facts

    def line(_: dict[str, object]) -> str:
        return step_said(f"group_{args.change.action}", scope.language, name=name)

    return _build(scope, args, expand, line)


class MatchingArgs(_BuildArgs):
    filter: ObjectFilter = Field(description="The same filter find_objects takes; check it there first.")
    changes: list[PropertyChange] = Field(min_length=1, max_length=8)
    add_missing: bool = Field(default=False, description="Add the component where an object lacks it.")
    limit: int = Field(default=100, ge=1, le=250, description="Most objects to edit; the rest are reported.")


def matching_edit(scope: TurnScope, args: MatchingArgs) -> Observation:
    def expand(project: Project, compiled: CompiledModel | None, room: int):
        if compiled is None and args.filter.needs_scene:
            raise ValueError("the design does not compile, so region and near cannot be measured")
        batch = edit_matching(
            matching(project, compiled, args.filter), args.changes, args.add_missing, args.limit, room
        )
        facts: dict[str, object] = {"edited": len(batch.edited), "objects": _shown(batch.edited)}
        if batch.lacking:
            facts["lacking_the_component"] = _shown(batch.lacking)
        if batch.capped:
            facts["left_out_by_the_cap"] = batch.capped
        return batch.operations, facts

    def line(facts: dict[str, object]) -> str:
        return step_said("matched_edit", scope.language, count=facts.get("edited", 0))

    return _build(scope, args, expand, line)


_ROUTE = "Returns the expansion and a try_id like try; propose or apply that try, or build on it with base_try."

PATTERN = Tool(
    name="pattern",
    description=(
        "Copy an object with everything inside it many times in one call, as plain create_object operations with "
        "fresh ids: duplicate (offset), linear (count, offset), grid (rows, columns, spacing, layers stacked up), "
        "circle (count, radius, facing the center), mirror (across a plane) or scatter (seeded, inside an area, min "
        "spacing, jitter of turn, scale and color). Platforms, steps and walls of cube blocks: place the library's "
        "block piece, then grid it. keep_clear skips copies that would overlap objects or zones, such as "
        f"the path or the spawn; group puts the copies in a new group. {_ROUTE}"
    ),
    args=PatternArgs,
    step="try",
    effect="read",
    run=pattern,
    per_turn=6,
    timeout_s=40,
    observation_chars=8_000,
)

EDIT_GROUP = Tool(
    name="edit_group",
    description=(
        "Edit an object together with everything inside it (a group): move, rotate around a pivot, scale "
        "uniformly (gaps and sizes inside grow too), make_group (wrap objects that share a parent in a new "
        "transform-only group without moving them) or ungroup. To duplicate a group use pattern. "
        f"{_ROUTE}"
    ),
    args=GroupArgs,
    step="try",
    effect="read",
    run=group,
    per_turn=6,
    timeout_s=40,
    observation_chars=8_000,
)

EDIT_MATCHING = Tool(
    name="edit_matching",
    description=(
        "Set properties on every object a find_objects filter matches (such as material.color on every crate), "
        "as plain set_property operations, capped by limit and reported: what was edited, what lacks the "
        f"component and what the cap left out. {_ROUTE}"
    ),
    args=MatchingArgs,
    step="try",
    effect="read",
    run=matching_edit,
    per_turn=6,
    timeout_s=40,
    observation_chars=8_000,
)
