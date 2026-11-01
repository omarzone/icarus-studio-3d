import json

from icarus.contracts.training import MetricPoint, StartRun
from icarus.copilot.context import design_reference, project_context
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
    assert context["workspace"] == "World" and context["selection"] is None
    assert context["latest_run"] == "No training has run for this project yet"


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


def test_the_design_reference_says_where_each_template_object_lives_and_how_to_add_one():
    reference = json.loads(design_reference())
    parking = reference["templates"]["parking_car"]
    assert {"ground", "sun", "spawn"} <= set(parking["world"])
    assert "car" in parking["bodies"]["car_body"] and "car" not in parking["world"]
    assert reference["templates"]["empty_world"]["bodies"] == {}
    rule = reference["rules"]["create_object"]
    assert '"world"' in rule and '"bodies"' in rule and "object.id" in rule


def test_the_design_reference_says_what_each_body_can_do_and_what_the_library_cannot():
    reference = json.loads(design_reference())
    car = reference["templates"]["parking_car"]["abilities"]["car_body"]
    assert car["motors"] == 4 and "distance_ray" in car["sensors"]
    assert reference["templates"]["humanoid"]["abilities"]["humanoid_body"]["motors"] == 12
    movement = reference["rules"]["movement"]
    assert "hinge" in movement and "fly" in movement and "thruster" in movement


def eval_point(step: int, **fields) -> MetricPoint:
    values = {"elapsed": 1.0, "episode_return": -4.5, "episode_length": 600, "reward_terms": {"time_penalty": -4.5}}
    return MetricPoint(kind="eval", step=step, **{**values, **fields})


def test_the_latest_run_brings_reward_terms_episode_length_and_its_budget(tmp_path):
    state = state_of("parking_car")
    runs = RunStore(tmp_path)
    folder = runs.folder(runs.create(state, StartRun(total_steps=30_000, copies=4), threads=2).run_id)
    folder.append_metric(eval_point(0))
    folder.append_metric(eval_point(25_000, reward_terms={"reach_goal": 2.0, "time_penalty": -3.0}))
    training = MetricPoint(
        kind="train", step=26_000, elapsed=9.0, episode_return=-1.0, episode_length=410, reward_terms={"reach_goal": 1}
    )
    folder.append_metric(training)
    run = json.loads(project_context(state, runs, None, None))["latest_run"]
    assert run["latest_evaluation"]["reward_terms"] == {"reach_goal": 2.0, "time_penalty": -3.0}
    assert run["latest_evaluation"]["episode_length"] == 600
    assert run["latest_training"]["episode_length"] == 410 and run["latest_training"]["step"] == 26_000
    assert run["recommended_steps"] == 1_000_000 and run["far_below_recommended"] is True


def test_bodies_bring_their_size_for_clearance_checks(tmp_path):
    context = json.loads(project_context(state_of("parking_car"), RunStore(tmp_path), None, None))
    car = next(body for body in context["project"]["bodies"] if body["id"] == "car_body")
    length, width, height = car["size"]
    assert length >= 4 and width >= 1.8 and height > 0.5
