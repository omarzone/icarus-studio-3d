"""A project stored before vehicles and rectangular goals (raw wheel motors, a circular goal) loads, compiles, plays
and steps exactly as it did when it was saved."""

import json
from pathlib import Path

import numpy as np

from icarus.contracts.project import Project
from icarus.design.checks import design_report
from icarus.sim.env import ProjectEnv
from icarus.sim.play import PlaySession
from icarus.sim.policy import RandomPolicy

FIXTURES = Path(__file__).parent / "fixtures"


def stored_parking() -> Project:
    return Project.model_validate_json((FIXTURES / "raw_motor_parking.json").read_text(encoding="utf-8"))


def test_a_stored_raw_motor_car_passes_its_design_checks_without_a_vehicle_or_new_senses():
    project = stored_parking()
    report, compiled = design_report(project)
    assert report.ok, [check.detail for check in report.checks if check.status == "fail"]
    assert compiled is not None and not compiled.vehicles


def test_a_stored_raw_motor_car_steps_through_the_same_observations_and_rewards_it_recorded():
    trace = json.loads((FIXTURES / "raw_motor_parking_trace.json").read_text(encoding="utf-8"))
    env = ProjectEnv(stored_parking())
    assert env.action_space.shape == (trace["actions"],)
    assert env.observation_space.shape == (trace["observation"],)
    actions = np.random.default_rng(11).uniform(-1, 1, (len(trace["rewards"]), trace["actions"]))
    observations, rewards = [env.reset(seed=0)[0]], []
    for action in actions:
        observation, reward, *_ = env.step(action.astype(np.float32))
        observations.append(observation)
        rewards.append(reward)
    np.testing.assert_allclose(observations, trace["observations"], atol=2e-5)
    np.testing.assert_allclose(rewards, trace["rewards"], atol=2e-6)


def test_a_stored_raw_motor_car_plays_its_four_motors_and_shows_its_circular_goal_state():
    session = PlaySession(stored_parking(), 1, RandomPolicy(4, seed=0), seed=0)
    session.step_realtime(0.2)
    frame = session.frame()
    assert [action.id for action in frame.actions] == [
        "steer_left:motor",
        "wheel_rear_left:motor",
        "steer_right:motor",
        "wheel_rear_right:motor",
    ]
    assert frame.signals is not None and frame.signals.lights is None
    assert frame.signals.goal is not None and not frame.signals.goal.met
