import json

import pytest

from icarus.copilot.agent.tools import REGISTRY
from icarus.copilot.agent.tools.agents import AddAgentArgs, add_agent
from icarus.copilot.agent.tools.base import ToolServices, TurnScope
from icarus.copilot.agent.tools.layout import LayoutArgs, lay_out
from icarus.copilot.agent.tools.library import LibraryArgs, library
from icarus.copilot.agent.tools.proposing import ApplyArgs, apply
from icarus.projects.store import ProjectStore
from icarus.training.run_store import RunStore


@pytest.fixture
def scope(tmp_path) -> TurnScope:
    store = ProjectStore(tmp_path / "projects")
    project_id = store.create("Race", "walker_robot").project.id
    services = ToolServices(store, RunStore(tmp_path / "runs"), None, None, None)  # type: ignore[arg-type]
    return TurnScope(project_id, store.state(project_id), "autopilot", services)


def test_the_copilot_adds_a_library_body_as_an_agent_in_a_lane_of_the_obstacle_course(scope):
    course = {"recipe": "obstacle_course", "lanes": 2, "lane_width": 4, "spawn": False, "goal": False}
    laid = json.loads(lay_out(scope, LayoutArgs.model_validate({"layout": course, "start_at": (0, 0)})).text)
    assert laid["passed"], laid["checks"]
    lanes = laid["changes"]["layout"]["lanes"]
    assert len(lanes) == 2 and lanes[0]["start"] == [0.0, 0.0]
    applied = apply(scope, ApplyArgs(try_id=laid["try_id"], summary="Course"))
    assert applied.ok, applied.text
    args = AddAgentArgs(body="parking_car", name="Car", start=tuple(lanes[1]["start"]), goal=tuple(lanes[1]["goal"]))
    observation = add_agent(scope, args)
    result = json.loads(observation.text)
    assert observation.ok and result["passed"], result["checks"]
    assert result["agent"]["body"].endswith("car_body")
    applied = apply(scope, ApplyArgs(try_id=result["try_id"], summary="Car in lane 2"))
    assert applied.ok, applied.text
    project = scope.services.projects.state(scope.project_id).project
    assert [agent.name for agent in project.agents] == ["Walker", "Car"]


def test_an_unknown_body_is_refused_with_the_bodies_there_are(scope):
    observation = add_agent(scope, AddAgentArgs(body="dragon", name="Dragon", start=(0, 3), goal=(9, 3)))
    assert not observation.ok and "humanoid" in observation.text and scope.tries == {}


def test_the_tool_is_registered_and_the_library_marks_bodies_that_can_be_agents(scope):
    assert "add_agent" in REGISTRY
    entry = json.loads(library(scope, LibraryArgs(kind="humanoid")).text)
    assert entry["agent_body"]["family"] == "locomotion"
