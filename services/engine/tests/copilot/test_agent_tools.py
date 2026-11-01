import json

import pytest

from icarus.copilot.agent.tools.base import ToolServices, TurnScope
from icarus.copilot.agent.tools.inspect import InspectArgs, ReadRunArgs, inspect_object, read_run
from icarus.copilot.agent.tools.library import LibraryArgs, library
from icarus.copilot.agent.tools.look import LookArgs, look
from icarus.copilot.agent.tools.proposing import ProposeArgs, propose
from icarus.copilot.agent.tools.trying import TryArgs, try_change
from icarus.copilot.context import NO_RUN
from icarus.projects.store import ProjectStore
from icarus.sim.views import BlankPicture
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


class _BlankViews:
    def render(self, compiled, camera, zones, timeout=None) -> bytes:
        raise BlankPicture("every pixel is the same")


def test_a_blank_picture_is_a_failed_look_that_tells_the_model_not_to_describe_it(tmp_path):
    store = ProjectStore(tmp_path / "projects")
    project_id = store.create("Parking", "parking_car").project.id
    services = ToolServices(store, RunStore(tmp_path / "runs"), None, None, _BlankViews())  # type: ignore[arg-type]
    seen = look(TurnScope(project_id, store.state(project_id), "ask", services), LookArgs())
    assert not seen.ok and seen.image is None
    assert "could not be rendered" in seen.text and "Do not describe it" in seen.text
    assert seen.summary == "The picture could not be rendered"


def test_a_try_warns_about_lost_posture_terms_and_a_missing_finish_and_the_proposal_carries_it(tmp_path):
    store = ProjectStore(tmp_path / "projects")
    project_id = store.create("Race", "walker_robot").project.id
    services = ToolServices(store, RunStore(tmp_path / "runs"), None, None, None)  # type: ignore[arg-type]
    scope = TurnScope(project_id, store.state(project_id), "ask", services, request="quiero una carrera")
    operations: list[dict] = [{"op": "set_task_family", "family": "navigation"}]
    terms = ("forward_progress", "stay_upright", "energy_cost", "fall_penalty")
    operations += [{"op": "remove_reward_term", "term": term} for term in terms]
    operations.append({"op": "set_reward_term", "term": {"term": "reach_goal", "weight": 10, "params": {}}})
    tried = json.loads(try_change(scope, TryArgs.model_validate({"operations": operations, "look": None})).text)
    assert tried["passed"] and len(tried["warnings"]) == 2
    assert "stay_upright and fall_penalty" in tried["warnings"][0] and "goal zone" in tried["warnings"][1]
    propose(scope, ProposeArgs(try_id="t1", summary="Race", explanation="Switch to a race.", warnings=[]))
    assert scope.proposal is not None and scope.proposal.warnings == tried["warnings"]
