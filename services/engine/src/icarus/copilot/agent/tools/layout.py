from pydantic import Field

from icarus.contracts.operations import EditOperation
from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TurnScope
from icarus.copilot.agent.tools.trying import LookSpec, observed, tried
from icarus.copilot.step_words import step_said
from icarus.library.layouts import LayoutError, LayoutParams, expand_layout


class LayoutArgs(ToolArgs):
    layout: LayoutParams = Field(description="The recipe and the parameters to change; the rest keep their defaults.")
    start_at: tuple[float, float] | None = Field(
        default=None, description="World x, y where the layout's start lands; none puts it under the body."
    )
    also: list[EditOperation] = Field(
        default=[], max_length=30, description="More operations tried together with the layout, such as the task."
    )
    look: LookSpec | None = Field(default=None, description="Also render the candidate from this camera.")


def lay_out(scope: TurnScope, args: LayoutArgs) -> Observation:
    try:
        layout = expand_layout(args.layout, scope.state.project, args.start_at)
    except LayoutError as error:
        summary = step_said("tried_invalid", scope.language, changes=args.layout.recipe.replace("_", " "))
        return Observation(f"The layout cannot be made: {error}", ok=False, summary=summary)
    result, summary = tried(scope, [*layout.operations, *args.also])
    # The layout is summed up by area: listing each of its objects would crowd out the checks.
    result["changes"] = {"layout": layout.summary(), "also": len(args.also)}
    if not result["passed"]:
        result["hint"] = (
            "A body that overlaps the layout at its start or blows up there does not fit it: set clearance to half "
            "the body's width and its passages (cell, bay, lane, aisle, door) to more than the body's length."
        )
    return observed(scope, result, summary, args.look)


LAYOUT = Tool(
    name="layout",
    description=(
        "Lay out a whole believable environment in one call from a seeded engine recipe (parking_lot, room, maze, "
        "city_block, warehouse, forest, obstacle_course, terrain_steps): grouped, named objects from the library, "
        "the spawn at its start and the goal zone at its goal, with the way between them checked open. It runs a "
        "try of the layout plus the operations in also and returns its try_id for propose or apply. Read a "
        "recipe's parameters with library first. Customize it by its parameters; once applied, its objects and "
        "groups edit like any others."
    ),
    args=LayoutArgs,
    step="try",
    effect="read",
    run=lay_out,
    per_turn=4,
    timeout_s=60,
    observation_chars=8_000,
)
