"""A rectangular goal zone: inside by the whole footprint, aligned with the spot (either way, nose in or back in),
stopped, and success only when all of them hold."""

import math

import numpy as np
import pytest

from icarus.contracts.operations import SetProperty
from icarus.contracts.project import Project
from icarus.contracts.properties import ChoiceValue, NumberValue
from icarus.design.checks import design_report
from icarus.projects.operations import apply_operations
from icarus.sim.env import ProjectEnv
from icarus.sim.rewards import STOP_SPEED, RewardState, gentle_arrival, inside_goal, parked, spot_alignment
from tests.sim.conftest import project_from
from tests.sim.test_vehicle import place

SPOT = (12.0, 0.0)
IDLE = np.array([0.0, -1.0, 0.0], dtype=np.float32)


def with_goal(prop: str, value: ChoiceValue | NumberValue) -> Project:
    change = SetProperty(op="set_property", object="goal", component="goal_zone", property=prop, value=value)
    return apply_operations(project_from("parking_car"), [change])


def signal_at(project: Project, x: float, y: float, yaw: float):
    env = ProjectEnv(project)
    env.reset(seed=0)
    place(env, x, y, yaw)
    _, _, terminated, _, info = env.step(IDLE)
    signals = env.poses().signals
    assert signals is not None and signals.goal is not None
    return signals.goal, terminated, info


def test_a_car_parked_wholly_inside_lined_up_and_still_wins_the_try():
    goal, terminated, info = signal_at(project_from("parking_car"), *SPOT, 0)
    assert (goal.inside, goal.aligned, goal.stopped, goal.met) == (True, True, True, True)
    assert terminated and info["is_success"]


def test_a_car_across_the_spot_is_neither_inside_nor_aligned():
    goal, terminated, _ = signal_at(project_from("parking_car"), *SPOT, 90)
    assert not goal.inside and not goal.aligned and not goal.met and not terminated


def test_a_car_half_out_of_the_spot_is_not_inside_though_its_center_is():
    goal, terminated, _ = signal_at(project_from("parking_car"), SPOT[0] + 2.4, 0, 0)
    assert not goal.inside and goal.aligned and not terminated


def test_a_car_a_little_turned_is_aligned_within_the_tolerance_and_not_beyond():
    assert signal_at(project_from("parking_car"), *SPOT, 10)[0].aligned
    assert not signal_at(project_from("parking_car"), *SPOT, 20)[0].aligned


@pytest.mark.parametrize(
    ("entry", "nose_in", "backed_in"), [("either", True, True), ("nose_in", True, False), ("back_in", False, True)]
)
def test_the_entry_rule_decides_which_way_round_counts(entry, nose_in, backed_in):
    project = with_goal("entry", ChoiceValue(type="choice", value=entry))
    assert signal_at(project, *SPOT, 0)[0].met is nose_in
    assert signal_at(project, *SPOT, 180)[0].met is backed_in


def test_a_car_rolling_through_the_spot_has_not_parked():
    env = ProjectEnv(project_from("parking_car"))
    env.reset(seed=0)
    place(env, *SPOT, 0)
    agent = env.world.agent
    dof = int(env.world.model.jnt_dofadr[int(env.world.model.body_jntadr[agent])])
    env.world.data.qvel[dof] = 1.0
    _, _, terminated, _, _ = env.step(IDLE)
    signals = env.poses().signals
    assert signals is not None and signals.goal is not None
    assert signals.goal.inside and not signals.goal.stopped and not terminated


def test_a_spot_smaller_than_the_body_that_must_fit_wholly_is_refused_with_its_sizes():
    report, _ = design_report(with_goal("width", NumberValue(type="number", value=2.0)))
    check = next(check for check in report.checks if check.id == "reachable")
    assert check.status == "fail" and "only 5 × 2 m" in check.detail


def state(**fields) -> RewardState:
    base = {
        "position": (0.0, 0.0, 0.5),
        "forward": (1.0, 0.0),
        "up": 1.0,
        "goal": (0.0, 0.0, 0.0),
        "goal_radius": 1.0,
        "colliding": False,
        "fallen": False,
        "effort": 0.0,
        "speed": 0.0,
    }
    return RewardState(**(base | fields))


def test_a_classic_circle_measures_the_center_against_its_radius_as_before():
    assert inside_goal(state(position=(0.9, 0.0, 0.5))) and not inside_goal(state(position=(1.1, 0.0, 0.5)))
    assert parked(state(speed=STOP_SPEED)) and not parked(state(speed=STOP_SPEED + 0.01))


def test_measured_rules_decide_parking_over_the_radius():
    assert not parked(state(goal_inside=False))
    assert not parked(state(goal_inside=True, goal_aligned=False))
    assert parked(state(goal_inside=True, goal_aligned=True, speed=0.4, stop_speed=0.5))


def test_spot_alignment_pays_for_getting_lined_up_and_closer_not_for_waiting():
    near_aligned = state(goal_alignment=1.0, position=(2.5, 0.0, 0.5))
    # Waiting lined up next to the spot earns nothing, so a car cannot collect it outside instead of parking.
    assert spot_alignment(near_aligned, near_aligned) == 0
    # Lining up and getting closer pays the gain; turning away or backing off costs it back.
    assert spot_alignment(state(position=(2.5, 0.0, 0.5)), near_aligned) == pytest.approx(0.5)
    assert spot_alignment(near_aligned, state(goal_alignment=1.0)) == pytest.approx(0.5)
    assert spot_alignment(state(goal_alignment=1.0), near_aligned) == pytest.approx(-0.5)
    assert spot_alignment(state(), state(goal_alignment=1.0, position=(6.0, 0.0, 0.5))) == 0
    assert spot_alignment(state(goal=None), state(goal=None, goal_alignment=1.0)) == 0


def test_gentle_arrival_pays_for_slowing_down_inside_not_for_lingering():
    assert gentle_arrival(state(speed=0.5), state(speed=0.0)) == pytest.approx(0.5)
    assert gentle_arrival(state(speed=2.0), state(speed=0.5)) == pytest.approx(0.5)
    # Sitting still inside earns nothing more, so lingering never beats meeting the parking rule.
    assert gentle_arrival(state(speed=0.0), state(speed=0.0)) == 0
    assert gentle_arrival(state(speed=0.0), state(speed=0.5)) == 0
    assert gentle_arrival(state(speed=0.5), state(speed=0.0, goal_inside=False)) == 0


def test_the_alignment_score_follows_the_entry_rule():
    env = ProjectEnv(with_goal("entry", ChoiceValue(type="choice", value="back_in")))
    env.reset(seed=0)
    place(env, *SPOT, 180)
    env.step(IDLE)
    assert env.state.goal_alignment == pytest.approx(1.0, abs=1e-3)
    place(env, *SPOT, 0)
    env.step(IDLE)
    assert env.state.goal_alignment == pytest.approx(-1.0, abs=1e-3)
    assert math.isclose(env.state.stop_speed, STOP_SPEED)
