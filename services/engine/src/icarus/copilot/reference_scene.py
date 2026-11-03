"""Clone a scene from words or a reference picture: plan, assemble, try, render, compare and correct, in rounds."""

import base64
import json
import time
from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.operations import AddBody, EditOperation
from icarus.contracts.project import Project
from icarus.copilot.agent.tools.base import TurnScope
from icarus.copilot.agent.tools.trying import MAX_OPERATIONS, tried
from icarus.copilot.building.part_plan import compound_problems
from icarus.copilot.building.scene_corrections import apply_corrections
from icarus.copilot.building.scene_plan import LOWEST_CAMERA, Correction, ScenePlan, piece_size, scene_operations
from icarus.copilot.client import CopilotError, ModelClient, UserContent
from icarus.copilot.scratch_stages import placement_problem
from icarus.design.checks import design_report
from icarus.library.layouts import RECIPES
from icarus.library.pieces import pieces_by_category
from icarus.projects.operations import OperationError, apply_operations
from icarus.sim.views import BlankPicture, CameraSpec, RenderUnavailable

MAX_ROUNDS = 3
# A comparison and the assembly after it; a round that cannot finish before the deadline is not started.
ROUND_SECONDS = 30.0
PLAN_SECONDS = 90.0
COMPARE_SECONDS = 60.0
WIDTH, HEIGHT = 640, 400

PLAN_SYSTEM = """You plan scenes for Icarus Studio 3D, a MuJoCo studio. From the person's words and, when given, a
reference picture, describe the scene as a plan the engine builds out of library objects. Every item becomes a
normal editable object, and the engine tests the result physically.

Units and frames: SI, degrees, z is up, +x is forward, the ground is z = 0. Sizes are full width (x), depth (y) and
height (z); cylinders and capsules run along their own z and take (diameter, diameter, length).
1. Name the place and a scale anchor: something whose real size you know (a car is 4.5 m long, a door 2.1 m, a
   person 1.7 m, a storey 3 m, a road lane 3.5 m). Size everything from it and keep the scene within about 40 m.
2. Estimate the camera the reference was taken from (look at point, distance, azimuth, elevation, field of view), so
   a render from it can be compared with the picture. A camera above the ground looking down has a negative
   elevation (about -15 to -35 for a photo taken from eye level or a little higher). Without a picture choose a
   clear three-quarter view.
3. Ground, sky, sun and a palette of 2 to 8 colors from the picture: preset and clock_time for the hour, clouds,
   haze and fog for the weather (fog at 0.3 or less), ambient 0.6 to 1.2.
4. Use a layout recipe when the place is clearly one of them: {recipes}.
5. Prefer library pieces when one fits; give each an id, its x, y and heading, and a size, color or finish only to
   match the picture. Pieces rest on the ground (lift_m raises them). Pieces: {pieces}
6. Anything no piece fits is a compound object built of parts (box, sphere, capsule, cylinder, wedge, corner_wedge
   for slopes and roofs): "scenery" for things that stay put (a house, a fountain, a kiosk), "body" for things
   that move (a car with turning wheels).
   Root parts sit from the object's origin on the ground; other parts sit from their parent's center. Give each
   part a look: color, style (wheel, car_body, shell, wall, tree...), finish (glass for windows, brick, wood,
   painted_metal...), roughness, metalness, emissive for lights. collides is true for what physics touches and
   false for look-only detail (windows, trims, lights). Body parts that collide need a mass (a car 900 to 1500 kg
   in all, a wheel 10 to 25 kg). A wheel is a cylinder with rotation (-90, 0, 0), a hinge on axis (0, 0, 1),
   limits (-180, 180), damping about 2 and a torque motor; the body's lowest point rests on the ground.
7. List in left_out what you see but cannot express. Keep the area where a body starts (around x = 0, y = 0)
   clear unless the picture puts something there."""

COMPARE_SYSTEM = """You compare a render of a planned scene with what it must look like: the person's reference
picture when there is one (the first picture), else their words. The last picture is the render, taken from the
plan's camera. List the concrete differences that matter most (missing or extra objects, wrong sizes, positions,
colors, materials, lighting, sky, ground or camera) and the corrections that fix them, naming plan items by id. Use
move, resize, restyle, remove, add_piece, add_object and set_look; never correct what already matches. Set
close_enough true when the render already reads as the reference, with no corrections. A camera correction keeps the
plan's conventions: azimuth 0 looks along +x and 90 along +y, and elevation below zero looks down from above."""

ASK = """Request: {request}
{reference}"""

COMPARE = """Refinement round {round} of {rounds}.
Request: {request}
The plan that was built (JSON): {plan}
Not placed so far: {not_placed}"""


class _Plan(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SceneDifference(_Plan):
    kind: Literal["missing", "extra", "size", "position", "color", "material", "lighting", "sky", "ground", "camera"]
    item: str | None = Field(description="The plan item id it is about; null for the whole scene.")
    detail: str = Field(min_length=1, max_length=200)


class SceneComparison(_Plan):
    close_enough: bool
    differences: list[SceneDifference] = Field(max_length=12)
    corrections: list[Correction] = Field(max_length=20)


@dataclass
class Round:
    number: int
    differences: list[str]
    applied: list[str]
    refused: list[str]
    try_id: str | None = None
    passed: bool = False


@dataclass
class CloneOutcome:
    plan: ScenePlan | None
    # The last try that passed, which the copilot may propose; None when nothing passed.
    try_id: str | None
    result: dict
    rounds: list[Round] = field(default_factory=list)
    not_placed: list[str] = field(default_factory=list)
    stopped: str = ""
    picture: bytes | None = None


def plan_problems(plan: ScenePlan) -> list[str]:
    """What in a plan the engine cannot build: unknown pieces, repeated ids and compound objects that do not hold."""
    problems = [
        f"pieces[{piece.id}]: no library piece `{piece.piece}`" for piece in plan.pieces if piece_size(piece) is None
    ]
    ids = [item.id for item in [*plan.pieces, *plan.objects, *plan.lamps]]
    problems += [f"the id `{item}` is used twice" for item in sorted({item for item in ids if ids.count(item) > 1})]
    for compound in plan.objects:
        problems += [f"objects[{compound.id}]: {problem}" for problem in compound_problems(compound)]
    if plan.camera.height() < LOWEST_CAMERA:
        problems.append(
            f"camera: it stands {-plan.camera.height():.1f} m under the ground and sees the scene from below; "
            "give elevation_deg below zero to look down from above"
        )
    return problems


def _data_url(png: bytes) -> str:
    return f"data:image/png;base64,{base64.b64encode(png).decode()}"


def _content(text: str, pictures: list[str]) -> UserContent:
    if not pictures:
        return text
    return [{"type": "text", "text": text}, *({"type": "image_url", "image_url": {"url": url}} for url in pictures)]


def _plan_system() -> str:
    recipes = "; ".join(f"{key} ({recipe.label})" for key, recipe in RECIPES.items())
    pieces = json.dumps(pieces_by_category(), ensure_ascii=False, separators=(",", ":"))
    return PLAN_SYSTEM.format(recipes=recipes, pieces=pieces)


def _item_problem(project: Project, operations: list[EditOperation]) -> str | None:
    try:
        candidate = apply_operations(project, operations)
    except OperationError as error:
        return str(error)
    report, _ = design_report(candidate)
    failed = [f"{check.label}: {check.detail}" for check in report.checks if check.status == "fail"]
    if failed:
        return "; ".join(failed)
    for op in operations:
        if isinstance(op, AddBody) and (problem := placement_problem(candidate, op.body.id)):
            return problem
    return None


def fitting_operations(project: Project, plan: ScenePlan, clear: bool) -> tuple[list[EditOperation], list[str]]:
    """The plan's operations with every item that breaks the design left out, and what was left out and why."""
    assembly = scene_operations(project, plan, clear)
    not_placed = list(assembly.not_placed)
    kept, base = dict(assembly.items), list(assembly.base)
    while len(base) + sum(len(ops) for ops in kept.values()) > MAX_OPERATIONS and kept:
        dropped = list(kept)[-1]
        not_placed.append(f"{dropped}: the change would pass {MAX_OPERATIONS} operations")
        kept.pop(dropped)
    everything = base + [op for ops in kept.values() for op in ops]
    if _item_problem(project, everything) is None or _item_problem(project, base) is not None:
        return everything, not_placed
    built = list(base)
    for item, operations in kept.items():
        problem = _item_problem(project, [*built, *operations])
        if problem:
            not_placed.append(f"{item}: {problem}")
        else:
            built += operations
    return built, not_placed


class ReferenceClone:
    """One clone request's rounds on a turn: its planner, the judge that sees pictures, and the time it has."""

    def __init__(self, scope: TurnScope, planner: ModelClient, judge: ModelClient | None, deadline: float) -> None:
        self.scope, self.planner, self.judge, self.deadline = scope, planner, judge, deadline

    def _assembled(self, plan: ScenePlan, clear: bool, round_: Round) -> tuple[dict, list[str]]:
        operations, not_placed = fitting_operations(self.scope.state.project, plan, clear)
        result, _ = tried(self.scope, operations)
        round_.try_id, round_.passed = result["try_id"], bool(result["passed"])
        return result, not_placed

    def _render(self, try_id: str, plan: ScenePlan) -> bytes | str:
        compiled = self.scope.tries[try_id].compiled
        if compiled is None:
            return "the try did not compile"
        camera = plan.camera.above_ground()
        spec = CameraSpec(
            camera.lookat, camera.distance_m, camera.azimuth_deg, camera.elevation_deg, WIDTH, HEIGHT, camera.fov_deg
        )
        try:
            return self.scope.services.views.render(compiled, spec, [], timeout=20)
        except RenderUnavailable:
            return "no picture can be rendered on this machine"
        except BlankPicture:
            return "the render came out blank"

    def _compare(self, request: str, reference: str | None, plan: ScenePlan, picture: bytes, number: int, rounds: int,
                 not_placed: list[str]) -> SceneComparison | str:  # fmt: skip
        assert self.judge is not None
        text = COMPARE.format(
            round=number,
            rounds=rounds,
            request=request,
            plan=plan.model_dump_json(),
            not_placed="; ".join(not_placed) or "nothing",
        )
        pictures = [*([reference] if reference else []), _data_url(picture)]
        try:
            reply = self.judge.ask(
                "scene_comparison",
                SceneComparison,
                COMPARE_SYSTEM,
                _content(text, pictures),
                deadline=self.deadline,
                timeout=COMPARE_SECONDS,
            )
        except CopilotError as error:
            return f"the comparison failed: {error}"
        return reply.value

    def run(self, request: str, reference: str | None, rounds: int, clear: bool) -> CloneOutcome:
        rounds = min(max(rounds, 0), MAX_ROUNDS)
        ask = ASK.format(request=request, reference="The reference picture follows." if reference else "No picture.")
        try:
            reply = self.planner.ask(
                "scene_plan",
                ScenePlan,
                _plan_system(),
                _content(ask, [reference] if reference else []),
                check=plan_problems,
                deadline=self.deadline,
                timeout=PLAN_SECONDS,
            )
        except CopilotError as error:
            return CloneOutcome(None, None, {}, stopped=f"the scene could not be planned: {error}")
        plan = reply.value
        first = Round(0, [], [], [])
        result, not_placed = self._assembled(plan, clear, first)
        outcome = CloneOutcome(plan, result["try_id"] if first.passed else None, result, [first], not_placed)
        picture: bytes | None = None
        for number in range(1, rounds + 1):
            if not outcome.try_id:
                outcome.stopped = "the planned scene did not pass its try"
                break
            if self.judge is None:
                outcome.stopped = "refinement not run: no model that sees pictures is connected"
                break
            if time.monotonic() > self.deadline - ROUND_SECONDS:
                outcome.stopped = f"refinement stopped before round {number}: the time budget ran out"
                break
            rendered = self._render(outcome.try_id, plan)
            if isinstance(rendered, str):
                outcome.stopped = f"refinement not run: {rendered}"
                break
            picture = rendered
            comparison = self._compare(request, reference, plan, rendered, number, rounds, outcome.not_placed)
            if isinstance(comparison, str):
                outcome.stopped = comparison
                break
            differences = [
                f"{item.kind}{f' {item.item}' if item.item else ''}: {item.detail}" for item in comparison.differences
            ]
            if comparison.close_enough or not comparison.corrections:
                outcome.rounds.append(Round(number, differences, [], []))
                outcome.stopped = "the render matches the reference closely enough"
                break
            fixed, applied, refused = apply_corrections(plan, comparison.corrections)
            this = Round(number, differences, applied, refused)
            outcome.rounds.append(this)
            if not applied:
                outcome.stopped = "no correction could be applied"
                break
            result, not_placed = self._assembled(fixed, clear, this)
            if not this.passed:
                outcome.stopped = f"round {number}'s corrections did not pass their try, so the round before is kept"
                break
            plan, picture = fixed, None
            outcome.plan, outcome.try_id, outcome.result, outcome.not_placed = fixed, this.try_id, result, not_placed
        else:
            outcome.stopped = f"used every refinement round ({rounds})" if rounds else "no refinement was asked for"
        if outcome.try_id and picture is None and outcome.plan is not None:
            rendered = self._render(outcome.try_id, outcome.plan)
            picture = rendered if isinstance(rendered, bytes) else None
        outcome.picture = picture
        return outcome
