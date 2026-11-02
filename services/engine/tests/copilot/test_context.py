import json

from icarus.contracts.training import MetricPoint, StartRun
from icarus.copilot.context import project_context
from icarus.training.run_store import RunStore
from tests.training.conftest import state_of


def test_the_context_summarizes_the_project_and_its_library_entries(tmp_path):
    context = json.loads(
        project_context(state_of("parking_car"), RunStore(tmp_path), selection=None, workspace="World")
    )
    car = context["project"]["objects"]["car"]
    assert car["name"] == "Car" and car["in"] == "car_body"
    assert car["components"]["physics_body"]["mass"] == 900
    assert context["project"]["objects"]["sun"]["components"]["light"]["intensity"] == 1
    assert {term["term"] for term in context["project"]["task"]["rewards"]} >= {"reach_goal", "time_penalty"}
    light = context["library"]["components"]["light"]["properties"]["intensity"]
    assert light["min"] == 0 and light["max"] == 5
    assert "box" in context["library"]["pieces"] and "parking_car" in context["library"]["templates"]
    assert context["workspace"] == "World" and context["selection"] is None and context["latest_run"] is None


def test_the_selection_brings_its_schema_with_hints(tmp_path):
    context = json.loads(project_context(state_of("parking_car"), RunStore(tmp_path), "steer_left", None))
    selection = context["selection"]
    assert selection["id"] == "steer_left" and selection["name"] == "Front left steering"
    joint = selection["components"]["joint"]
    assert joint["values"]["limits"] == [-35, 35]
    assert joint["schema"]["anchor"]["hint"]


def test_the_latest_run_brings_its_status_and_evaluations(tmp_path):
    state = state_of("parking_car")
    runs = RunStore(tmp_path)
    status = runs.create(state, StartRun(total_steps=300_000, copies=16), threads=4)
    folder = runs.folder(status.run_id)
    point = MetricPoint(
        kind="eval",
        step=100_000,
        elapsed=80.0,
        episode_return=3.5,
        episode_length=240,
        success_rate=0.35,
        failure_rate=0.4,
        reward_terms={"reach_goal": 3.5},
    )
    folder.append_metric(point)
    run = json.loads(project_context(state, runs, None, None))["latest_run"]
    assert run["name"] == "Run 1" and run["total_steps"] == 300_000
    assert run["evaluations"] == [{"step": 100_000, "episode_return": 3.5, "success_rate": 0.35, "failure_rate": 0.4}]
