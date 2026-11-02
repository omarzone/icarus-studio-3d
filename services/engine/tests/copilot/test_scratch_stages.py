import json
import time
from pathlib import Path

import httpx
import pytest

from icarus.copilot.client import Connection, ModelClient
from icarus.copilot.fixture_provider import fixture_transport, fixtures_root
from icarus.copilot.scratch_design import scratch_system
from icarus.copilot.scratch_plan import PlanPart, ScratchPlan
from icarus.copilot.scratch_stages import (
    StageFailed,
    assemble,
    plan_stages,
    starting_project,
    trainability_problem,
)
from icarus.design.checks import design_report
from icarus.projects.operations import apply_operations

FIXTURE = Path(__file__).parent / "fixtures" / "scratch_plan" / "default.json"


def fixture_plan() -> ScratchPlan:
    return ScratchPlan.model_validate(json.loads(FIXTURE.read_text(encoding="utf-8"))["replies"][0]["content"])


def recording_client(asked: list[tuple[str, str]], answer: dict | None = None) -> ModelClient:
    """Answers from fixtures, or with one fixed answer, and records each request's role and user message."""
    fixtures = fixture_transport(fixtures_root())

    def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        asked.append((body["response_format"]["json_schema"]["name"], body["messages"][1]["content"]))
        if answer is None:
            return fixtures.handle_request(request)
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(answer)}}]})

    return ModelClient(Connection("http://fixtures.invalid/v1", "", "fixtures"), httpx.MockTransport(handle))


def built(plan: ScratchPlan):
    project = starting_project("Warehouse runner")
    for stage in plan_stages(plan):
        project = apply_operations(project, stage.operations)
    return project


def with_part(plan: ScratchPlan, part_id: str, **changes) -> ScratchPlan:
    body = plan.bodies[0]
    parts: list[PlanPart] = [part.model_copy(update=changes) if part.id == part_id else part for part in body.parts]
    return plan.model_copy(update={"bodies": [body.model_copy(update={"parts": parts})]})


def test_a_sound_plan_is_built_stage_by_stage_without_asking_the_model():
    asked: list[tuple[str, str]] = []
    design = assemble(
        recording_client(asked), scratch_system(), "Warehouse runner", fixture_plan(), time.monotonic() + 60
    )
    assert asked == []
    assert [(stage.id, stage.label) for stage in design.stages] == [
        ("world", "Building the world"),
        ("body:delivery_bot", "Building Delivery robot"),
        ("task", "Setting the task"),
    ]
    project = built(design.plan)
    assert design_report(project)[0].ok and trainability_problem(project) is None
    assert project.task.family == "navigation" and project.brain.copies == 8


def test_the_world_stage_builds_the_planned_look_with_real_materials():
    plan = fixture_plan()
    project = built(plan)
    objects = {obj.id: obj for obj in project.world.objects}
    values = {
        obj_id: {c.kind: {k: v.model_dump().get("value") for k, v in c.properties.items()} for c in obj.components}
        for obj_id, obj in objects.items()
    }
    assert values["ground"]["material"]["color"] == plan.world.ground_color
    assert values["ground"]["surface"]["kind"] == "asphalt"
    assert values["shelf_left"]["material"]["color"] == "#2f5d8a"
    assert values["shelf_left"]["physics_body"]["mode"] == "static"
    assert values["crate"]["physics_body"]["mode"] == "dynamic" and values["crate"]["material"]["surface"] == "wood"
    assert values["lane_left"]["mesh"]["size"] == (9.0, 0.08, 0.01)
    assert values["goal"]["goal_zone"]["radius"] == 1.0 and values["dock_area"]["zone"]["effect"] == "none"
    assert values["lamp_dock"]["light"]["kind"] == "point"
    assert values["spawn"]["transform"]["position"] == (0.0, 0.0, 0.0)


def test_a_body_that_starts_inside_the_ground_is_repaired_once_with_the_precise_error():
    asked: list[tuple[str, str]] = []
    sunk = with_part(fixture_plan(), "chassis", position=(0.0, 0.0, 0.05))
    design = assemble(recording_client(asked), scratch_system(), "Warehouse runner", sunk, time.monotonic() + 60)
    assert [role for role, _ in asked] == ["scratch_body_fix"]
    request = asked[0][1]
    assert "inside the ground" in request and "Building Delivery robot" in request
    assert '"shelf_left"' in request and '"chassis"' in request
    assert design.plan.bodies[0].parts[0].position == (0.0, 0.0, 0.18)


def test_a_stage_that_still_fails_after_its_repair_stops_the_design():
    sunk = with_part(fixture_plan(), "chassis", position=(0.0, 0.0, 0.05))
    asked: list[tuple[str, str]] = []
    client = recording_client(asked, answer=sunk.bodies[0].model_dump())
    with pytest.raises(StageFailed, match="Building Delivery robot: .*inside the ground.*after the repair"):
        assemble(client, scratch_system(), "Warehouse runner", sunk, time.monotonic() + 60)
    assert len(asked) == 1


def test_wheels_too_weak_to_move_the_body_fail_the_trainability_gate():
    plan = fixture_plan()
    for wheel in ("wheel_left", "wheel_right"):
        motor = next(part for part in plan.bodies[0].parts if part.id == wheel).motor
        assert motor is not None
        plan = with_part(plan, wheel, motor=motor.model_copy(update={"max_force": 1.0}))
    assert "cannot move the body" in (trainability_problem(built(plan)) or "")


def test_a_goal_under_the_start_fails_the_trainability_gate():
    plan = fixture_plan()
    assert plan.world.goal is not None
    goal = plan.world.goal.model_copy(update={"position": (0.0, 0.0), "radius": 4.0})
    plan = plan.model_copy(update={"world": plan.world.model_copy(update={"goal": goal})})
    assert "reaches the goal" in (trainability_problem(built(plan)) or "")


def test_a_navigation_plan_without_a_goal_fails_the_world_stage():
    plan = fixture_plan()
    plan = plan.model_copy(update={"world": plan.world.model_copy(update={"goal": None})})
    client = recording_client([], answer=plan.world.model_dump())
    with pytest.raises(StageFailed, match="Building the world: A navigation task needs a goal"):
        assemble(client, scratch_system(), "Warehouse runner", plan, time.monotonic() + 60)


def test_the_plan_offers_exactly_the_library_surfaces():
    from typing import get_args

    from icarus.copilot.scratch_plan import Surface
    from icarus.design.surfaces import SURFACE_FRICTION
    from icarus.library.components import SURFACES

    assert set(get_args(Surface)) == set(SURFACES) == set(SURFACE_FRICTION)
