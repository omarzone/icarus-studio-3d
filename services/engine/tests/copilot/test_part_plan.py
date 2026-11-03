import json

import mujoco
import pytest

from icarus.copilot.agent.tools.base import ToolServices, TurnScope
from icarus.copilot.agent.tools.cloning import BuildObjectArgs, build_object
from icarus.copilot.building.part_plan import CompoundObject, compound_operations, compound_problems
from icarus.copilot.scratch_stages import placement_problem, starting_project
from icarus.design.checks import design_report
from icarus.projects.operations import apply_operations
from icarus.projects.store import ProjectStore
from icarus.training.run_store import RunStore

DRIVE_SECONDS = 2.0


def _look(color: str, **more) -> dict:
    return {"color": color, **more}


def _wheel(part_id: str, x: float, y: float) -> dict:
    return {
        "id": part_id,
        "name": part_id.replace("_", " ").capitalize(),
        "parent": "chassis",
        "shape": "cylinder",
        "size": [0.64, 0.64, 0.22],
        "position": [x, y, -0.25],
        "rotation": [-90, 0, 0],
        "look": _look("#1f2023", style="wheel", surface="rubber"),
        "collides": True,
        "mass": 15,
        "joint": {"kind": "hinge", "axis": [0, 0, 1], "limits": [-180, 180], "anchor": [0, 0, 0], "damping": 2},
        "motor": {"kind": "torque", "max_force": 120},
    }


def sedan(position=(0.0, 0.0, 0.0), heading: float = 0.0) -> dict:
    """A red sedan as a planner would describe it: chassis, cabin, glass, a lit headlight and four driven wheels."""
    return {
        "id": "sedan",
        "name": "Sedan",
        "kind": "body",
        "position": list(position),
        "heading_deg": heading,
        "parts": [
            {
                "id": "chassis",
                "name": "Chassis",
                "parent": None,
                "shape": "box",
                "size": [4.2, 1.7, 0.5],
                "position": [0, 0, 0.57],
                "rotation": [0, 0, 0],
                "look": _look("#b3122e", finish="painted_metal", metalness=0.8, roughness=0.3),
                "collides": True,
                "mass": 500,
            },
            {
                "id": "cabin",
                "name": "Cabin",
                "parent": "chassis",
                "shape": "box",
                "size": [2.2, 1.5, 0.5],
                "position": [-0.2, 0, 0.5],
                "rotation": [0, 0, 0],
                "look": _look("#b3122e"),
                "collides": True,
                "mass": 80,
            },
            {
                "id": "windshield",
                "name": "Windshield",
                "parent": "cabin",
                "shape": "box",
                "size": [0.05, 1.4, 0.42],
                "position": [1.11, 0, 0],
                "rotation": [0, 0, 0],
                "look": _look("#9fc4d8", finish="glass", transparency=0.4),
                "collides": False,
            },
            {
                "id": "headlight",
                "name": "Headlight",
                "parent": "chassis",
                "shape": "box",
                "size": [0.05, 0.3, 0.12],
                "position": [2.11, 0.55, 0.1],
                "rotation": [0, 0, 0],
                "look": _look("#fff6d5", emissive=2),
                "collides": False,
            },
            _wheel("wheel_front_left", 1.35, 0.95),
            _wheel("wheel_front_right", 1.35, -0.95),
            _wheel("wheel_rear_left", -1.35, 0.95),
            _wheel("wheel_rear_right", -1.35, -0.95),
        ],
    }


def kiosk(position=(5.0, 3.0, 0.0)) -> dict:
    """A small static kiosk: two solid walls, a roof and a look-only glass front."""
    wall = {"shape": "box", "rotation": [0, 0, 0], "collides": True, "parent": None}
    return {
        "id": "kiosk",
        "name": "Kiosk",
        "kind": "scenery",
        "position": list(position),
        "heading_deg": 90,
        "parts": [
            wall
            | {"id": "back", "name": "Back wall", "size": [0.2, 2, 2.4], "position": [-0.9, 0, 1.2]}
            | {"look": _look("#c9a27a", finish="wood")},
            wall
            | {"id": "roof", "name": "Roof", "size": [2.2, 2.4, 0.15], "position": [0, 0, 2.475]}
            | {"look": _look("#4a4f57", finish="painted_metal")},
            {
                "id": "glass",
                "name": "Glass front",
                "parent": "roof",
                "shape": "box",
                "size": [0.04, 2, 2.2],
                "position": [0.9, 0, -1.2],
                "rotation": [0, 0, 0],
                "look": _look("#a8d0e6", finish="glass", transparency=0.5),
                "collides": False,
            },
        ],
    }


def test_a_planned_car_compiles_rests_on_the_ground_and_its_wheel_motors_drive_it():
    car = CompoundObject.model_validate(sedan())
    assert compound_problems(car) == []
    project = starting_project("Car")
    project = apply_operations(project, compound_operations(project, car))
    report, compiled = design_report(project)
    assert report.ok and compiled is not None, [check.detail for check in report.checks]
    assert placement_problem(project, "sedan") is None
    model = compiled.model
    assert model.nu == 4
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    chassis = model.body(compiled.objects["sedan_chassis"]).id
    start = data.xpos[chassis].copy()
    for _ in range(round(DRIVE_SECONDS / model.opt.timestep)):
        data.ctrl[:] = 1.0
        mujoco.mj_step(model, data)
    # Full forward torque rolls the car along +x without tipping it over.
    assert data.xpos[chassis][0] - start[0] > 1.0
    assert abs(data.xpos[chassis][2] - start[2]) < 0.1


def test_look_only_parts_of_a_car_are_drawn_but_never_touched_and_keep_their_finish():
    car = CompoundObject.model_validate(sedan())
    project = starting_project("Car")
    project = apply_operations(project, compound_operations(project, car))
    parts = {obj.id: obj for obj in project.bodies[0].objects}
    glass = {component.kind: component for component in parts["sedan_windshield"].components}
    assert "collider" not in glass and "physics_body" not in glass
    assert glass["material"].properties["finish"].model_dump()["value"] == "glass"
    light = {component.kind: component for component in parts["sedan_headlight"].components}
    assert light["material"].properties["emissive"].model_dump()["value"] == 2
    _, compiled = design_report(project)
    assert compiled is not None
    geom = compiled.model.geom("sedan_windshield")
    assert int(geom.contype[0]) == 0 and int(geom.conaffinity[0]) == 0


def test_a_turned_car_folds_its_origin_and_heading_into_the_root_part():
    car = CompoundObject.model_validate(sedan(position=(3.0, -2.0, 0.0), heading=90))
    project = starting_project("Car")
    project = apply_operations(project, compound_operations(project, car))
    root = next(obj for obj in project.bodies[0].objects if obj.parent is None)
    transform = next(component for component in root.components if component.kind == "transform")
    assert transform.properties["position"].model_dump()["value"] == pytest.approx((3.0, -2.0, 0.57))
    assert transform.properties["rotation"].model_dump()["value"] == pytest.approx((0.0, 0.0, 90.0))


def test_scenery_becomes_one_static_group_whose_glass_is_look_only():
    shop = CompoundObject.model_validate(kiosk())
    assert compound_problems(shop) == []
    project = starting_project("Street")
    project = apply_operations(project, compound_operations(project, shop))
    objects = {obj.id: obj for obj in project.world.objects}
    assert objects["kiosk_back"].parent == "kiosk" and objects["kiosk_glass"].parent == "kiosk_roof"
    kinds = {key: {component.kind for component in objects[key].components} for key in ("kiosk", "kiosk_back")}
    assert kinds["kiosk"] == {"transform"}
    assert {"collider", "physics_body"} <= kinds["kiosk_back"]
    report, _ = design_report(project)
    assert report.ok


def test_part_plans_that_cannot_hold_up_are_refused_with_the_reason():
    moving_shop = kiosk()
    moving_shop["parts"][0]["joint"] = {
        "kind": "hinge",
        "axis": [0, 0, 1],
        "limits": [-90, 90],
        "anchor": [0, 0, 0],
        "damping": 1,
    }
    assert any("must be a body" in item for item in compound_problems(CompoundObject.model_validate(moving_shop)))
    heavy = sedan()
    heavy["parts"][4]["mass"] = 9_000
    assert any("kg/m³" in item for item in compound_problems(CompoundObject.model_validate(heavy)))
    orphan = sedan()
    orphan["parts"][1]["parent"] = "nothing"
    assert any("parent" in item for item in compound_problems(CompoundObject.model_validate(orphan)))
    two_roots = sedan()
    two_roots["parts"][1]["parent"] = None
    assert any("exactly one root" in item for item in compound_problems(CompoundObject.model_validate(two_roots)))
    huge = kiosk()
    huge["parts"][0]["position"] = [-90, 0, 1.2]
    assert any("spans" in item for item in compound_problems(CompoundObject.model_validate(huge)))


@pytest.fixture
def scope(tmp_path) -> TurnScope:
    store = ProjectStore(tmp_path / "projects")
    project_id = store.create("Street", "empty_world").project.id
    services = ToolServices(store, RunStore(tmp_path / "runs"), None, None, None)  # type: ignore[arg-type]
    return TurnScope(project_id, store.state(project_id), "ask", services)


def test_build_object_tries_the_assembled_car_and_refuses_a_broken_plan_without_a_try(scope):
    observation = build_object(scope, BuildObjectArgs.model_validate({"object": sedan()}))
    result = json.loads(observation.text)
    assert observation.ok and result["passed"], result["checks"]
    assert any(check["check"] == "placement of Sedan" and check["ok"] for check in result["checks"])
    broken = sedan()
    broken["parts"][0]["joint"] = broken["parts"][4]["joint"]
    refused = build_object(scope, BuildObjectArgs.model_validate({"object": broken}))
    assert not refused.ok and "root part" in refused.text and list(scope.tries) == [result["try_id"]]
