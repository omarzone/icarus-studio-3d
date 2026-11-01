import json

import pytest

from icarus.copilot.agent.tools.base import ToolServices, TurnScope
from icarus.copilot.agent.tools.inspect import InspectArgs, ReadRunArgs, inspect_object, read_run
from icarus.copilot.agent.tools.library import LibraryArgs, library
from icarus.copilot.agent.tools.trying import TryArgs, try_change
from icarus.copilot.context import NO_RUN
from icarus.projects.store import ProjectStore
from icarus.training.run_store import RunStore


@pytest.fixture
def scope(tmp_path) -> TurnScope:
    store = ProjectStore(tmp_path / "projects")
    project_id = store.create("Parking", "parking_car").project.id
    services = ToolServices(store, RunStore(tmp_path / "runs"), None, None, None)  # type: ignore[arg-type]
    return TurnScope(project_id, store.state(project_id), "ask", services)


def test_a_piece_carries_the_valid_values_of_its_components(scope):
    wall = json.loads(library(scope, LibraryArgs(kind="wall")).text)
    assert wall["type"] == "piece" and wall["object"]["id"] == "wall"
    assert "asphalt" in wall["component_schemas"]["material"]["surface"]["options"]


def test_a_body_is_inspected_part_by_part_with_schemas(scope):
    observation = inspect_object(scope, InspectArgs(object="car_body"))
    parts = json.loads(observation.text)["parts"]
    steering = next(part for part in parts if part["id"] == "steer_left")
    assert steering["components"]["motor"]["schema"] and observation.summary == "Inspected Car"


def test_reading_runs_before_any_training_says_so_exactly(scope):
    observation = read_run(scope, ReadRunArgs())
    assert observation.text == NO_RUN and observation.run_facts


def test_a_template_brings_the_operations_that_add_its_body_and_task_to_this_project(tmp_path):
    store = ProjectStore(tmp_path / "projects")
    project_id = store.create("Empty", "empty_world").project.id
    services = ToolServices(store, RunStore(tmp_path / "runs"), None, None, None)  # type: ignore[arg-type]
    scope = TurnScope(project_id, store.state(project_id), "ask", services)
    walker = json.loads(library(scope, LibraryArgs(kind="walker_robot")).text)
    operations = walker["operations_for_this_project"]
    assert "add_body" in [op["op"] for op in operations]
    assert not any(op["op"] == "create_object" and op["object"]["id"] == "ground" for op in operations)
    tried = json.loads(try_change(scope, TryArgs.model_validate({"operations": operations, "look": None})).text)
    assert tried["passed"], tried["checks"]
