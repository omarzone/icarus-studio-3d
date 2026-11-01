import json
import logging
import threading
from pathlib import Path

import httpx
import pytest

from icarus.contracts.operations import SetBrain
from icarus.copilot.architect import CREATE_OBJECT_EXAMPLE, NoValidIdeas, estimate_minutes, propose_ideas
from icarus.copilot.client import Connection, ModelClient
from icarus.copilot.fixture_provider import fixture_transport
from icarus.design.compiler import compile_project
from icarus.library.templates import template_operations
from icarus.projects.operations import apply_operations, empty_project

PARKING_PROMPT = "a little car that learns to park itself"


def counting_client() -> tuple[ModelClient, list[str]]:
    """A fixture-answering client that records the schema name of every request."""
    fixtures = fixture_transport()
    roles: list[str] = []

    def handle(request: httpx.Request) -> httpx.Response:
        body = httpx.Response(200, content=request.content).json()
        roles.append(body["response_format"]["json_schema"]["name"])
        return fixtures.handle_request(request)

    return ModelClient(Connection("http://fixtures.invalid/v1", "", "fixtures"), httpx.MockTransport(handle)), roles


def test_a_prompt_gives_three_compiled_ideas_with_real_scenes():
    client, roles = counting_client()
    idea_set, drafts = propose_ideas(client, PARKING_PROMPT)
    assert roles == ["design_ideas"]
    assert idea_set.prompt == PARKING_PROMPT and len(idea_set.ideas) == 3
    assert [idea.recommended for idea in idea_set.ideas] == [True, False, False]
    for idea in idea_set.ideas:
        assert idea.template == "parking_car" and idea.family == "navigation"
        assert idea.estimate_minutes >= 1_000_000 / 2000 / 60 - 1e-9
        assert {"car", "goal"} <= {geom.body for geom in idea.scene.geoms} | {body.name for body in idea.scene.bodies}
        assert set(drafts) >= {idea.id}
    walled = next(idea for idea in idea_set.ideas if "wall" in idea.world.lower())
    assert any(geom.name.startswith("bay_wall") for geom in walled.scene.geoms)


def test_an_idea_with_a_bad_operation_is_retried_once_then_dropped():
    client, roles = counting_client()
    idea_set, _ = propose_ideas(client, "an obstacle course for a robot")
    assert roles == ["design_ideas", "design_idea_fix"]
    assert len(idea_set.ideas) == 2 and idea_set.ideas[0].recommended


def draft(title: str, template: str) -> dict:
    return {
        "title": title,
        "world": "A lot",
        "body": "A car",
        "learns": "To park",
        "template": template,
        "operations": [],
    }


def test_fix_ups_for_failing_ideas_run_at_the_same_time():
    both_asked = threading.Barrier(2, timeout=5)

    def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if body["response_format"]["json_schema"]["name"] == "design_ideas":
            content = {"ideas": [draft("First", "nope"), draft("Second", "nope")]}
        else:
            try:
                both_asked.wait()
            except threading.BrokenBarrierError:
                return httpx.Response(500, json={"error": {"message": "asked one at a time"}})
            content = draft("Fixed", "parking_car")
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(content)}}]})

    client = ModelClient(Connection("http://fixtures.invalid/v1", "", "fixtures"), httpx.MockTransport(handle))
    idea_set, _ = propose_ideas(client, "two broken ideas")
    assert [idea.recommended for idea in idea_set.ideas] == [True, False]


def test_no_valid_idea_is_an_error():
    client, _ = counting_client()
    with pytest.raises(NoValidIdeas):
        propose_ideas(client, "something impossible that floats in nothing")


def answering(drafts: list[dict], fixed: dict, systems: list[str] | None = None) -> ModelClient:
    """A model that proposes the given drafts and answers every fix-up with the same fixed draft."""

    def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if systems is not None:
            systems.append(body["messages"][0]["content"])
        if body["response_format"]["json_schema"]["name"] == "design_ideas":
            content: dict = {"ideas": drafts}
        else:
            content = fixed
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(content)}}]})

    return ModelClient(Connection("http://fixtures.invalid/v1", "", "fixtures"), httpx.MockTransport(handle))


def test_the_architect_is_shown_a_valid_create_object_and_told_to_promise_only_what_it_builds():
    systems: list[str] = []
    propose_ideas(answering([draft("Lot", "parking_car")], draft("Lot", "parking_car"), systems), "park")
    system = " ".join(systems[0].split())
    assert CREATE_OBJECT_EXAMPLE.model_dump_json() in system
    assert CREATE_OBJECT_EXAMPLE.target == "world"
    parking = apply_operations(empty_project("000000000000", "Lot"), template_operations("parking_car"))
    assert any(
        obj.id == CREATE_OBJECT_EXAMPLE.object.id
        for obj in apply_operations(parking, [CREATE_OBJECT_EXAMPLE]).world.objects
    )
    assert "only what can be built from the library" in system
    assert "closest real option" in system
    assert '"abilities"' in system and '"rules"' in system


def flying_box() -> dict:
    box = {
        "op": "create_object",
        "target": "world",
        "object": {"id": "drone", "name": "Drone", "parent": None, "components": []},
    }
    return {
        **draft("Drone", "empty_world"),
        "learns": "To fly to the goal",
        "operations": [{"op": "set_task_family", "family": "navigation"}, box],
    }


def test_an_idea_that_must_train_without_a_motorized_body_is_dropped_with_its_reason(caplog):
    caplog.set_level(logging.INFO, logger="icarus.copilot.architect")
    with pytest.raises(NoValidIdeas) as error:
        propose_ideas(answering([flying_box()], flying_box()), "a drone that flies")
    assert "motor" in error.value.reasons["Drone"]
    assert "Drone" in caplog.text and "motor" in caplog.text


def test_fewer_than_three_ideas_are_logged_with_how_many_and_why(caplog):
    caplog.set_level(logging.INFO, logger="icarus.copilot.architect")
    client, _ = counting_client()
    idea_set, _ = propose_ideas(client, "an obstacle course for a robot")
    assert len(idea_set.ideas) == 2
    assert "2 of 3 ideas" in caplog.text and "trailer" in caplog.text


def test_no_valid_idea_carries_each_drafts_reason():
    client, _ = counting_client()
    with pytest.raises(NoValidIdeas) as error:
        propose_ideas(client, "something impossible that floats in nothing")
    assert set(error.value.reasons) == {"Hovercraft", "Impossible weight"}
    assert "hovercraft" in error.value.reasons["Hovercraft"]


WAREHOUSE_PROMPT = "a three-wheeled delivery robot that drives through a warehouse to a loading dock"


def test_a_request_no_template_fits_gives_a_from_scratch_idea_with_a_real_scene():
    client, roles = counting_client()
    idea_set, drafts = propose_ideas(client, WAREHOUSE_PROMPT)
    assert sorted(roles) == ["design_ideas", "scratch_plan"]
    scratch = idea_set.ideas[0]
    assert scratch.template == "empty_world" and scratch.family == "navigation" and scratch.recommended
    geoms = {geom.name: geom for geom in scratch.scene.geoms}
    assert {"chassis", "wheel_left", "caster", "shelf_left", "lane_left", "crate"} <= set(geoms)
    assert geoms["shelf_left"].color == "#2f5d8a" and geoms["lane_left"].color == "#f2c230"
    assert any(zone.kind == "goal_zone" for zone in scratch.scene.zones)
    design = drafts[scratch.id].design
    assert design is not None and [stage.id for stage in design.stages] == ["world", "body:delivery_bot", "task"]
    assert idea_set.ideas[1].template == "parking_car" and drafts[idea_set.ideas[1].id].design is None


def test_a_from_scratch_idea_whose_stages_cannot_be_repaired_is_dropped_with_its_reason():
    def handle(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        role = body["response_format"]["json_schema"]["name"]
        content = fixture_content("design_ideas", "warehouse")
        if role == "design_ideas":
            content["ideas"] = content["ideas"][:1]
        else:
            content = fixture_content("scratch_plan", "default")
            if role == "scratch_body_fix":
                content = content["bodies"][0]
            for part in (content["bodies"][0] if role == "scratch_plan" else content)["parts"]:
                if part["id"] == "chassis":
                    part["position"] = [0, 0, 0.05]
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(content)}}]})

    client = ModelClient(Connection("http://fixtures.invalid/v1", "", "fixtures"), httpx.MockTransport(handle))
    with pytest.raises(NoValidIdeas) as error:
        propose_ideas(client, WAREHOUSE_PROMPT)
    assert "inside the ground" in error.value.reasons["Warehouse runner"]


def fixture_content(role: str, name: str) -> dict:
    path = Path(__file__).parent / "fixtures" / role / f"{name}.json"
    return json.loads(path.read_text(encoding="utf-8"))["replies"][0]["content"]


def test_the_architect_may_choose_the_empty_world_and_is_told_what_cannot_be_built():
    systems: list[str] = []
    propose_ideas(answering([draft("Lot", "parking_car")], draft("Lot", "parking_car"), systems), "park")
    system = " ".join(systems[0].split())
    assert '"empty_world"' in system and "outline" in system


def _built(template: str, copies: int | None = None):
    operations = template_operations(template)
    if copies is not None:
        operations.append(SetBrain(op="set_brain", copies=copies))
    project = apply_operations(empty_project("000000000000", template), operations)
    return project, compile_project(project)


def test_training_estimates_depend_on_the_task_the_body_and_the_copies():
    car, walker, humanoid = (estimate_minutes(*_built(name)) for name in ("parking_car", "walker_robot", "humanoid"))
    assert car == pytest.approx(1_000_000 / 2000 / 60)
    assert car < walker < humanoid
    assert estimate_minutes(*_built("walker_robot", copies=4)) > walker
