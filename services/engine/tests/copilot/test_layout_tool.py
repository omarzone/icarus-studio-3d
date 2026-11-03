import json

import pytest

from icarus.copilot.agent.tools import REGISTRY
from icarus.copilot.agent.tools.base import ToolServices, TurnScope
from icarus.copilot.agent.tools.layout import LayoutArgs, lay_out
from icarus.copilot.agent.tools.library import LibraryArgs, library
from icarus.copilot.agent.tools.proposing import ProposeArgs, propose
from icarus.copilot.scratch_plan import PlanLayout
from icarus.copilot.scratch_stages import plan_stages, stage_problem, starting_project
from icarus.library.layouts import RECIPES
from icarus.projects.operations import apply_operations
from icarus.projects.store import ProjectStore
from icarus.training.run_store import RunStore
from tests.copilot.test_scratch_stages import fixture_plan


@pytest.fixture
def scope(tmp_path) -> TurnScope:
    store = ProjectStore(tmp_path / "projects")
    project_id = store.create("Parking", "parking_car").project.id
    services = ToolServices(store, RunStore(tmp_path / "runs"), None, None, None)  # type: ignore[arg-type]
    return TurnScope(project_id, store.state(project_id), "ask", services)


def test_a_parking_lot_around_the_car_passes_every_check_and_can_be_proposed(scope):
    args = LayoutArgs.model_validate({"layout": {"recipe": "parking_lot", "free_bays": [4], "goal_bay": 4}})
    observation = lay_out(scope, args)
    result = json.loads(observation.text)
    assert observation.ok and result["passed"], result["checks"]
    assert any(check["check"] == "placement of Car" and check["ok"] for check in result["checks"])
    layout = result["changes"]["layout"]
    assert layout["goal_bay"] == 4 and 4 in layout["free_bays"] and "Parked cars" in layout["groups"]
    proposed = propose(scope, ProposeArgs(try_id=result["try_id"], summary="Parking lot", explanation="A lot."))
    assert proposed.ok and scope.proposal is not None


def test_a_layout_that_cannot_keep_its_way_open_is_refused_without_a_try(scope):
    args = LayoutArgs.model_validate({"layout": {"recipe": "maze", "cell_size": 1.2, "clearance": 1.0}})
    observation = lay_out(scope, args)
    assert not observation.ok and "clearance" in observation.text and scope.tries == {}


def test_the_layout_tool_is_registered_and_the_library_lists_every_recipe_with_its_parameters(scope):
    assert "layout" in REGISTRY
    found = json.loads(library(scope, LibraryArgs(query="layout")).text)
    assert {item["id"] for item in found} == set(RECIPES)
    maze = json.loads(library(scope, LibraryArgs(kind="maze")).text)
    assert maze["type"] == "layout"
    assert maze["parameters"]["cells_x"] == {
        "default": 6,
        "minimum": 1,
        "maximum": 15,
        "description": "Cells along x. Default 6.",
    }


def test_a_from_scratch_plan_that_names_a_layout_gets_the_place_and_its_goal():
    plan = fixture_plan()
    world = plan.world.model_copy(update={"layout": PlanLayout(recipe="warehouse", seed=2), "goal": None})
    plan = plan.model_copy(update={"world": world})
    project = starting_project("Warehouse runner")
    stage = plan_stages(plan)[0]
    built = apply_operations(project, stage.operations)
    assert stage_problem(built, stage, plan) is None
    ids = {obj.id for obj in built.world.objects}
    assert {"warehouse", "warehouse_goal", "warehouse_shelving"} <= ids
