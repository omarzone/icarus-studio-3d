"""Tools that create from a description or a reference: one compound object, or a whole scene refined in rounds."""

import base64
import time

from pydantic import Field

from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TurnScope
from icarus.copilot.agent.tools.inspect import compact
from icarus.copilot.agent.tools.trying import LookSpec, base_of, run_try, too_many
from icarus.copilot.attachments import UnknownAttachment
from icarus.copilot.building.part_plan import CompoundObject, compound_operations, compound_problems
from icarus.copilot.language import Language
from icarus.copilot.reference_scene import MAX_ROUNDS, CloneOutcome, ReferenceClone

# The tool's own share of the turn: planning, up to three comparisons and their tries.
CLONE_SECONDS = 140.0
MARGIN_SECONDS = 8.0

_SAID: dict[str, dict[Language, str]] = {
    "object_refused": {"en": "Planned {name}, which does not hold up", "es": "Planeé {name}, que no se sostiene"},
    "no_model": {"en": "Could not plan the scene: no model", "es": "No pude planear la escena: no hay modelo"},
    "no_picture": {"en": "Looked for a reference picture", "es": "Busqué una imagen de referencia"},
    "cloned": {
        "en": "Built the scene from the reference in {rounds} rounds",
        "es": "Armé la escena de la referencia en {rounds} rondas",
    },
    "clone_failed": {"en": "Planned a scene that did not pass", "es": "Planeé una escena que no pasó"},
}


def said(key: str, language: Language, **values: object) -> str:
    return _SAID[key][language].format(**values)[:200]


class BuildObjectArgs(ToolArgs):
    object: CompoundObject = Field(description="The object as parts; the engine assembles, checks and tries it.")
    base_try: str | None = Field(default=None, description="A passing try id this one builds on.")
    look: LookSpec | None = Field(default=None, description="Also render the candidate from this camera.")


def build_object(scope: TurnScope, args: BuildObjectArgs) -> Observation:
    problems = compound_problems(args.object)
    if problems:
        text = f"The object cannot be built: {'; '.join(problems)}. Fix these parts and call build_object again."
        return Observation(text, ok=False, summary=said("object_refused", scope.language, name=args.object.name))
    base = base_of(scope, args.base_try)
    if isinstance(base, str):
        return Observation(base, ok=False, summary=said("object_refused", scope.language, name=args.object.name))
    operations = [*base[0], *compound_operations(base[1], args.object)]
    if problem := too_many(len(operations)):
        return Observation(problem, ok=False, summary=said("object_refused", scope.language, name=args.object.name))
    return run_try(scope, operations, args.look)


BUILD_OBJECT = Tool(
    name="build_object",
    description=(
        "Build any object or body from parts (box, sphere, capsule, cylinder) with sizes, relative transforms and a "
        "look per part (color, style, finish such as glass, roughness, metalness, emissive for lights). scenery "
        "becomes a group of static world objects; body becomes a body that moves and can learn, with hinge or "
        "slide joints and motors on its moving parts (wheels, doors, limbs). collides false makes look-only detail. "
        "The engine checks structure, scale and mass, then runs a try and returns its try_id. Use it to clone a "
        "car, a house or a robot from a picture or a description when no library piece fits."
    ),
    args=BuildObjectArgs,
    step="try",
    effect="read",
    run=build_object,
    per_turn=4,
    timeout_s=40,
    observation_chars=8_000,
)


class ReferenceSceneArgs(ToolArgs):
    request: str = Field(min_length=1, max_length=1_000, description="What to build, in the person's words.")
    picture: int | None = Field(
        default=None, ge=1, le=10, description="Which attached picture is the reference; none uses the first one."
    )
    rounds: int = Field(default=2, ge=0, le=MAX_ROUNDS, description="Rounds of render, compare and correct.")
    replace_scene: bool = Field(
        default=False, description="Remove the world's current objects first (ground, lights, sky, spawn, goal stay)."
    )


def _reference(scope: TurnScope, number: int | None) -> str | None | Observation:
    try:
        found = scope.services.attachments.of_project(scope.project_id, scope.attachments)
    except UnknownAttachment:
        found = []
    pictures = [item for item in found if item.info.kind == "image"]
    if not pictures:
        return None
    index = (number or 1) - 1
    if index >= len(pictures):
        text = f"This message carries {len(pictures)} reference pictures, so there is no picture {number}."
        return Observation(text, ok=False, summary=said("no_picture", scope.language))
    picture = pictures[index]
    return f"data:{picture.info.media_type};base64,{base64.b64encode(picture.content()).decode()}"


def outcome_text(outcome: CloneOutcome) -> dict:
    """What the copilot reads: the final try, each round, and everything that was not placed."""
    plan = outcome.plan
    return {
        "try_id": outcome.try_id,
        "passed": outcome.try_id is not None,
        "place": plan.place if plan else None,
        "scale_anchor": plan.scale_anchor if plan else None,
        "camera": plan.camera.above_ground().model_dump() if plan else None,
        "items": {
            "pieces": [piece.id for piece in plan.pieces] if plan else [],
            "objects": [item.id for item in plan.objects] if plan else [],
            "layout": plan.layout.recipe if plan and plan.layout else None,
        },
        "rounds": [
            {
                "round": item.number,
                "differences": item.differences,
                "applied": item.applied,
                "refused": item.refused,
                "try_passed": item.passed,
            }
            for item in outcome.rounds
        ],
        "not_placed": outcome.not_placed,
        "stopped": outcome.stopped or None,
        "checks": outcome.result.get("checks", []),
        "warnings": outcome.result.get("warnings", []),
    }


def reference_scene(scope: TurnScope, args: ReferenceSceneArgs) -> Observation:
    if scope.client is None:
        text = "The scene cannot be planned here: no model connection is available to this tool."
        return Observation(text, ok=False, summary=said("no_model", scope.language))
    reference = _reference(scope, args.picture)
    if isinstance(reference, Observation):
        return reference
    deadline = time.monotonic() + CLONE_SECONDS - MARGIN_SECONDS
    if scope.deadline is not None:
        deadline = min(deadline, scope.deadline - MARGIN_SECONDS)
    judge = scope.vision
    outcome = ReferenceClone(scope, scope.client, judge, deadline).run(
        args.request, reference, args.rounds, args.replace_scene
    )
    result = outcome_text(outcome)
    refined = sum(1 for item in outcome.rounds if item.number > 0)
    summary = said("cloned" if outcome.try_id else "clone_failed", scope.language, rounds=refined)
    if outcome.picture is None or not outcome.try_id:
        return Observation(compact(result), ok=outcome.try_id is not None, summary=summary)
    label = f"the cloned scene from its reference camera (try {outcome.try_id})"
    if scope.take_view_slot():
        info = scope.services.attachments.add_bytes(
            scope.project_id, f"{label[:80]}.png", "image/png", outcome.picture, "view"
        )
        with scope.guard:
            scope.views.append(info)
    text = f"{compact(result)}\nRendered {label}. The picture follows in the next message."
    return Observation(text, image=outcome.picture, image_label=label, summary=summary)


REFERENCE_SCENE = Tool(
    name="reference_scene",
    description=(
        "Clone a scene from the person's words and their attached reference picture: a model plans the place, its "
        "scale, camera, ground, sky and light, a layout recipe when one fits, library pieces and compound objects; "
        "the engine builds and tries it, renders it from the reference's camera, has a model that sees compare the "
        "render with the reference and applies its corrections, for up to three rounds. Returns the final try_id "
        "to propose, what changed each round and what was not placed. Everything stays normal editable objects."
    ),
    args=ReferenceSceneArgs,
    step="try",
    effect="read",
    run=reference_scene,
    per_turn=2,
    timeout_s=CLONE_SECONDS,
    observation_chars=10_000,
)
