import re

import numpy as np
import pytest

from icarus.sim.model_state import GOAL_DISTANCE_SCALE
from icarus.sim.policy import RandomPolicy
from icarus.training.evaluation import EVALUATION_SEED, evaluate
from tests.sim.conftest import project_from

OUTCOME = re.compile(r"^(Reached the parking spot at \d+\.\d s|Touched .+ at \d+\.\d s|Time ran out)$")


class SteerToSpot:
    label = "Drive toward the spot and stop there"

    def act(self, observation: np.ndarray) -> np.ndarray:
        distance, cos, sin = observation[-3] * GOAL_DISTANCE_SCALE, observation[-2], observation[-1]
        steer = float(np.clip(np.arctan2(sin, cos) / np.radians(35), -1, 1))
        throttle = float(np.clip(2 * (min(0.6 * distance, 1.6) - observation[5]), -1, 1))
        return np.array([steer, throttle, steer, throttle])


def test_the_same_seeds_give_the_same_returns_and_rollout(parking):
    first = evaluate(parking, RandomPolicy(4, seed=1), episodes=2, step=0)
    second = evaluate(parking, RandomPolicy(4, seed=1), episodes=2, step=0)
    assert first == second
    assert first.rollout.seed == EVALUATION_SEED and first.rollout.step == 0


def test_the_rollout_has_one_frame_per_control_step_and_says_how_it_ended(parking):
    result = evaluate(parking, RandomPolicy(4, seed=3), episodes=1, step=25_000)
    rollout = result.rollout
    assert len(rollout.frames) == result.episode_length
    times = [frame.time for frame in rollout.frames]
    assert np.allclose(np.diff(times), 0.05)
    assert sum(frame.reward for frame in rollout.frames) == pytest.approx(rollout.episode_return)
    assert rollout.episode_return == result.episode_return
    assert all(len(frame.positions) == len(rollout.geoms) for frame in rollout.frames)
    assert OUTCOME.match(rollout.outcome)
    assert set(result.reward_terms) == {"reach_goal", "progress_to_goal", "collision_penalty", "time_penalty"}


def test_steering_toward_the_spot_reaches_it_and_counts_as_success(parking):
    result = evaluate(parking, SteerToSpot(), episodes=5, step=0)
    assert result.rollout.outcome.startswith("Reached the parking spot at")
    assert result.success_rate is not None and result.success_rate >= 0.6
    assert result.episode_length < 600


def test_a_walker_has_no_success_rate():
    result = evaluate(project_from("walker_robot"), RandomPolicy(6, seed=0), episodes=1, step=0)
    assert result.success_rate is None
    assert result.rollout.outcome == f"Fell over at {result.rollout.frames[-1].time:.1f} s" or (
        result.rollout.outcome == "Time ran out"
    )


class Steady:
    label = "Hold every motor at its middle"

    def act(self, observation: np.ndarray) -> np.ndarray:
        return np.zeros(6)


def test_a_walker_episode_records_its_gait_and_a_car_episode_does_not(parking):
    steady = evaluate(project_from("walker_robot"), Steady(), episodes=1, step=0).episodes[0].gait
    jittery = evaluate(project_from("walker_robot"), RandomPolicy(6, seed=0), episodes=1, step=0).episodes[0].gait
    assert steady is not None and jittery is not None
    assert [foot.name for foot in steady.feet] == ["Left foot", "Right foot"]
    assert all(0 <= foot.contact_share <= 1 for foot in steady.feet)
    assert steady.start_height == pytest.approx(1.0)
    assert jittery.action_change > steady.action_change
    assert evaluate(parking, RandomPolicy(4, seed=1), episodes=1, step=0).episodes[0].gait is None
