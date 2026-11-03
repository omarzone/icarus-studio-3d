from pydantic import Field

from icarus.contracts.project import Project
from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TurnScope
from icarus.copilot.agent.tools.inspect import compact
from icarus.copilot.building.selection import DEFAULT_FIELDS, Located, ObjectFilter, RowField, matching, row
from icarus.copilot.step_words import step_said
from icarus.design.compile_error import CompileError
from icarus.design.compiler import CompiledModel, compile_project
from icarus.projects.operations import apply_operations

PAGE = 50


class FindArgs(ToolArgs):
    filter: ObjectFilter = Field(default_factory=ObjectFilter, description="Every condition given must hold.")
    fields: list[RowField] = Field(default=DEFAULT_FIELDS, min_length=1, max_length=13)
    limit: int = Field(default=PAGE, ge=1, le=200, description="Rows in this page.")
    offset: int = Field(default=0, ge=0, description="Rows to skip, for the next page.")
    on_try: str | None = Field(default=None, description="A passing try id: search that candidate instead.")


def scene_of(scope: TurnScope, on_try: str | None) -> tuple[Project, CompiledModel | None] | str:
    """The document and compiled scene to read: the project's, or a passing try's candidate."""
    if on_try is not None:
        tried = scope.tries.get(on_try)
        if tried is None or not tried.passed:
            return f"There is no passing try `{on_try}`; tries: {', '.join(scope.tries) or 'none yet'}"
        return apply_operations(scope.state.project, tried.operations), tried.compiled
    if scope.head_compiled is None:
        try:
            scope.head_compiled = compile_project(scope.state.project)
        except CompileError:
            return scope.state.project, None
    return scope.state.project, scope.head_compiled


def find_objects(scope: TurnScope, args: FindArgs) -> Observation:
    found = scene_of(scope, args.on_try)
    if isinstance(found, str):
        return Observation(found, ok=False, summary=step_said("find_failed", scope.language))
    project, compiled = found
    if compiled is None and args.filter.needs_scene:
        text = "The design does not compile, so region and near cannot be measured; filter by other fields."
        return Observation(text, ok=False, summary=step_said("find_failed", scope.language))
    matched = matching(project, compiled, args.filter)
    page = matched[args.offset : args.offset + args.limit]
    rows = [row(item, args.fields, _objects(project, item)) for item in page]
    result: dict[str, object] = {"total": len(matched), "offset": args.offset, "rows": rows}
    if args.offset + len(page) < len(matched):
        result["next_offset"] = args.offset + len(page)
    note = "Positions and sizes are world-frame boxes of each object's shapes (a group's: what it holds); "
    note += "local_position and rotation are its transform in its parent's frame."
    summary = step_said("found", scope.language, count=len(matched))
    return Observation(f"{compact(result)}\n{note}", summary=summary)


def _objects(project: Project, item: Located) -> list:
    if item.container == "world":
        return project.world.objects
    return next(body.objects for body in project.bodies if body.id == item.container)


FIND_OBJECTS = Tool(
    name="find_objects",
    description=(
        'Search the scene\'s objects (world and bodies) by name or text, component kinds ("group" for a '
        "transform-only parent), material color, style or surface, what they are inside, a world-frame box "
        "(region) or a distance from a point (near). Returns compact rows with the fields asked for, a total and "
        "next_offset for paging. Use it to find what to edit in a large scene instead of reading every object."
    ),
    args=FindArgs,
    step="inspect",
    effect="read",
    run=find_objects,
    per_turn=None,
    timeout_s=10,
)
