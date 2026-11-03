"""Floor plates measured on MuJoCo: pressed by the weight on them, occupied by a center over them, reached in order,
and the goals and reward terms built on them."""

import numpy as np
import pytest

from icarus.contracts.operations import CreateObject, EditOperation
from icarus.contracts.project import Project
from icarus.design.checks import design_report
from icarus.design.scene import scene_description
from icarus.library.pieces import PIECES
from icarus.library.templates import Part, Raw
from icarus.projects.operations import apply_operations
from icarus.sim.env import ProjectEnv
from icarus.sim.play import PlaySession
from icarus.sim.policy import RandomPolicy
from icarus.sim.rewards import RewardState, on_plate, plates_pressed, reach_plates
from tests.sim.conftest import project_from, with_term
from tests.sim.test_vehicle import place

IDLE = np.array([0.0, -1.0, 0.0], dtype=np.float32)
# Wide enough that all four of the car's wheels rest on it.
CAR_PLATE = (5.0, 3.4, 0.01)


def plate(id: str, x: float, y: float = 0.0, **settings: Raw) -> CreateObject:
    values: dict[str, Raw] = {"size": CAR_PLATE} | settings
    part = Part(id, id.replace("_", " ").capitalize(), None, {"transform": {"position": (x, y, 0)}, "plate": values})
    return CreateObject(op="create_object", target="world", object=part.spec())


def car_with(*operations: EditOperation) -> Project:
    return apply_operations(project_from("parking_car"), list(operations))


def settle(env: ProjectEnv, x: float, y: float = 0.0, steps: int = 10):
    place(env, x, y, 0)
    info: dict = {}
    terminated = False
    for _ in range(steps):
        _, _, terminated, _, info = env.step(IDLE)
        if terminated:
            break
    return terminated, info


def states(env: ProjectEnv) -> dict[str, tuple[bool, bool, bool]]:
    signals = env.poses().signals
    assert signals is not None
    return {item.object: (item.pressed, item.occupied, item.active) for item in signals.plates}


def test_a_car_resting_on_a_plate_presses_and_occupies_it_while_a_far_plate_stays_idle():
    env = ProjectEnv(car_with(plate("near", 6), plate("far", -8)))
    env.reset(seed=0)
    settle(env, 6)
    assert states(env) == {"near": (True, True, True), "far": (False, False, False)}


def test_a_plate_needs_its_press_force_while_a_center_trigger_ignores_weight():
    heavy = plate("heavy", 6, press_force=10_000)
    env = ProjectEnv(car_with(heavy))
    env.reset(seed=0)
    settle(env, 6)
    assert states(env)["heavy"] == (False, True, False)
    centered = plate("centered", 6, press_force=10_000, trigger="center")
    env = ProjectEnv(car_with(centered))
    env.reset(seed=0)
    settle(env, 6)
    assert states(env)["centered"] == (False, True, True)


def test_a_plate_watching_an_object_ignores_the_agent():
    crate = PIECES["box"].object.model_copy(update={"id": "crate", "name": "Crate"}, deep=True)
    add = CreateObject(op="create_object", target="world", object=crate)
    env = ProjectEnv(car_with(add, plate("for_crate", 6, watch="object", object="crate")))
    env.reset(seed=0)
    settle(env, 6)
    assert states(env)["for_crate"] == (False, False, False)


def test_a_plate_is_a_floor_patch_drawn_by_role_not_a_geom_or_an_obstacle():
    project = car_with(plate("pad", 6, role="pressure"), plate("start", -6, role="start"))
    report, _ = design_report(project)
    assert report.ok, [check.detail for check in report.checks if check.status == "fail"]
    env = ProjectEnv(project)
    env.reset(seed=0)
    settle(env, 6)
    assert not env.state.colliding
    scene = scene_description(env.world.compiled, 0)
    assert {item.object: item.role for item in scene.plates} == {"pad": "pressure", "start": "start"}
    assert not any(geom.name.endswith(":plate") for geom in scene.geoms)
    assert scene.plates[0].size == pytest.approx(CAR_PLATE)


def ordered_plates(mode: str) -> Project:
    project = car_with(plate("first", 6, order=1), plate("second", -8, order=2))
    return with_term(project, "reach_plates", 10, mode={"type": "choice", "value": mode})


def test_plates_in_order_count_only_once_the_ones_before_are_reached():
    env = ProjectEnv(ordered_plates("in_order"))
    env.reset(seed=0)
    terminated, _ = settle(env, -8)
    assert not terminated and env.state.plates_reached == 0
    terminated, _ = settle(env, 6)
    assert not terminated and env.state.plates_reached == 1
    terminated, info = settle(env, -8)
    assert terminated and info["is_success"]


@pytest.mark.parametrize(("mode", "visits"), [("all", (-8, 6)), ("any", (-8,))])
def test_reaching_all_plates_or_any_one_wins_the_try(mode, visits):
    env = ProjectEnv(ordered_plates(mode))
    env.reset(seed=0)
    results = [settle(env, x) for x in visits]
    assert [terminated for terminated, _ in results] == [False] * (len(visits) - 1) + [True]
    assert results[-1][1]["is_success"]


def test_only_target_plates_are_goals_when_the_world_has_any():
    project = car_with(plate("target", 6, role="target"), plate("press", -8, role="pressure"))
    env = ProjectEnv(with_term(project, "reach_plates", 10, mode={"type": "choice", "value": "all"}))
    env.reset(seed=0)
    assert [item.goal for item in env.world.plates] == [True, False]
    terminated, info = settle(env, 6)
    assert terminated and info["is_success"]


def test_plate_terms_pay_standing_newly_reached_plates_and_completing_the_goal():
    base = RewardState((0, 0, 0), (1, 0), 1, None, 0, False, False, 0, 0)
    one = RewardState((0, 0, 0), (1, 0), 1, None, 0, False, False, 0, 0, plates_on=1, plates_reached=1, plates_needed=2)
    both = RewardState(
        (0, 0, 0), (1, 0), 1, None, 0, False, False, 0, 0, plates_on=1, plates_reached=2, plates_needed=2
    )
    assert (on_plate(base, base), on_plate(base, one)) == (0, 1)
    assert (plates_pressed(base, one), plates_pressed(one, both), plates_pressed(both, both)) == (1, 1, 0)
    assert (reach_plates(base, one), reach_plates(one, both), reach_plates(both, both)) == (0, 1, 0)


def test_reaching_the_plates_resets_with_the_try():
    env = ProjectEnv(ordered_plates("all"))
    env.reset(seed=0)
    settle(env, 6)
    assert env.state.plates_reached == 1
    env.reset(seed=1)
    assert env.state.plates_reached == 0 and not any(env.world.plate_reached)


def test_play_tells_what_happened_when_a_plate_lights_and_the_plates_are_reached():
    session = PlaySession(ordered_plates("any"), 1, RandomPolicy(3, seed=0), seed=0)
    place_session = session.world
    free = int(place_session.model.jnt_qposadr[int(place_session.model.body_jntadr[place_session.agent])])
    place_session.data.qpos[free : free + 2] = (6, 0)
    session.speed = 1.0
    texts = [event.text for event in session.step_realtime(0.5)]
    assert "First pressed" in texts
    assert "Car reached the plates" in texts
    frame = session.frame()
    assert frame.signals is not None
    assert [(item.object, item.active) for item in frame.signals.plates] == [("first", True), ("second", False)]
