from dataclasses import replace

import pytest

from icarus.library.rewards import REWARD_TERMS
from icarus.sim.rewards import (
    HEIGHT_GAIN_MAX,
    OBJECT_REST_BONUS,
    OBJECT_STEP_LIMIT,
    TERM_FUNCTIONS,
    RewardState,
    compose,
    delivered,
)

STILL = RewardState(
    position=(0.0, 0.0, 0.5),
    forward=(1.0, 0.0),
    up=1.0,
    goal=(10.0, 0.0, 0.0),
    goal_radius=1.0,
    colliding=False,
    fallen=False,
    effort=0.0,
    speed=0.0,
)


def weighted(term: str, before: RewardState, after: RewardState, weight: float | None = None) -> float:
    total, _ = compose([term], [REWARD_TERMS[term].default_weight if weight is None else weight], before, after)
    return total


def test_every_library_term_has_a_function():
    assert set(TERM_FUNCTIONS) == set(REWARD_TERMS)


def test_progress_is_positive_when_getting_closer_and_negative_when_leaving():
    closer = replace(STILL, position=(1.0, 0.0, 0.5))
    assert weighted("progress_to_goal", STILL, closer) == pytest.approx(1.0)
    assert weighted("progress_to_goal", closer, STILL) == pytest.approx(-1.0)


def test_reach_goal_pays_once_when_the_agent_comes_to_rest_inside_the_zone():
    inside = replace(STILL, position=(9.5, 0.0, 0.5))
    assert weighted("reach_goal", STILL, inside) == pytest.approx(10)
    assert weighted("reach_goal", inside, inside) == 0


def test_passing_through_the_goal_zone_fast_is_not_reaching_it():
    passing = replace(STILL, position=(9.5, 0.0, 0.5), speed=1.0)
    assert weighted("reach_goal", STILL, passing) == 0
    assert weighted("reach_goal", passing, replace(passing, speed=0.0)) == pytest.approx(10)


def test_heading_alignment_is_highest_facing_the_goal():
    facing = weighted("heading_alignment", STILL, STILL, 1)
    sideways = weighted("heading_alignment", STILL, replace(STILL, forward=(0.0, 1.0)), 1)
    backwards = weighted("heading_alignment", STILL, replace(STILL, forward=(-1.0, 0.0)), 1)
    assert facing == pytest.approx(1) and sideways == pytest.approx(0) and backwards == pytest.approx(-1)


def test_collision_is_negative_when_a_contact_starts():
    hit = replace(STILL, colliding=True)
    assert weighted("collision_penalty", STILL, hit) < 0
    assert weighted("collision_penalty", hit, hit) == 0


def test_time_penalty_costs_every_step():
    assert weighted("time_penalty", STILL, STILL) == pytest.approx(-0.01)


def test_forward_progress_follows_world_x():
    assert weighted("forward_progress", STILL, replace(STILL, position=(0.5, 3.0, 0.5)), 1) == pytest.approx(0.5)


def test_stay_upright_is_highest_when_the_torso_is_vertical():
    upright = weighted("stay_upright", STILL, STILL)
    tilted = weighted("stay_upright", STILL, replace(STILL, up=0.5))
    assert upright > tilted > 0


def test_energy_cost_grows_with_effort():
    assert weighted("energy_cost", STILL, replace(STILL, effort=4.0)) < weighted("energy_cost", STILL, STILL) == 0


def test_fall_penalty_applies_once_when_falling():
    fallen = replace(STILL, fallen=True)
    assert weighted("fall_penalty", STILL, fallen) == pytest.approx(-10)
    assert weighted("fall_penalty", fallen, fallen) == 0


def test_compose_sums_weighted_parts_and_rejects_unknown_terms():
    closer = replace(STILL, position=(2.0, 0.0, 0.5))
    total, parts = compose(["progress_to_goal", "time_penalty"], [2.0, -0.5], STILL, closer)
    assert parts == {"progress_to_goal": pytest.approx(4.0), "time_penalty": pytest.approx(-0.5)}
    assert total == pytest.approx(3.5)
    with pytest.raises(ValueError):
        compose(["teleport"], [1.0], STILL, STILL)


CRATE = replace(STILL, object_position=(5.0, 0.0, 0.25))


def test_object_to_goal_pays_the_objects_progress_toward_the_goal():
    closer = replace(CRATE, object_position=(6.0, 0.0, 0.25))
    assert weighted("object_to_goal", CRATE, closer, 1) == pytest.approx(1.0)
    assert weighted("object_to_goal", closer, CRATE, 1) == pytest.approx(-1.0)


def test_object_to_goal_pays_a_bonus_once_the_object_comes_to_rest_inside_the_zone():
    rolling = replace(CRATE, object_position=(9.5, 0.0, 0.25), object_speed=1.0)
    resting = replace(rolling, object_speed=0.0)
    assert weighted("object_to_goal", rolling, resting, 1) == pytest.approx(OBJECT_REST_BONUS)
    assert weighted("object_to_goal", resting, resting, 1) == 0
    assert delivered(resting) and not delivered(rolling)


def test_object_to_goal_is_bounded_per_step_and_zero_without_an_object():
    jumped = replace(CRATE, object_position=(8.5, 0.0, 0.25), object_speed=1.0)
    assert weighted("object_to_goal", CRATE, jumped, 1) == pytest.approx(OBJECT_STEP_LIMIT)
    assert weighted("object_to_goal", STILL, STILL, 1) == 0


def test_height_gain_pays_the_height_above_the_start_clipped_to_its_limit():
    start = replace(STILL, start_height=0.5)
    assert weighted("height_gain", start, replace(start, position=(0.0, 0.0, 0.9)), 1) == pytest.approx(0.4)
    assert weighted("height_gain", start, replace(start, position=(0.0, 0.0, 9.0)), 1) == pytest.approx(HEIGHT_GAIN_MAX)
    assert weighted("height_gain", start, replace(start, position=(0.0, 0.0, 0.2)), 1) == 0


def test_coverage_pays_one_for_each_newly_visited_cell_and_nothing_for_old_ones():
    before = replace(STILL, visited=3)
    assert weighted("coverage", before, replace(before, visited=4), 1) == pytest.approx(1.0)
    assert weighted("coverage", before, before, 1) == 0


def test_body_height_is_one_at_the_target_and_zero_thirty_percent_away():
    standing = replace(STILL, position=(0.0, 0.0, 1.0), target_height=1.0)
    assert weighted("body_height", STILL, standing, 1) == pytest.approx(1.0)
    assert weighted("body_height", STILL, replace(standing, position=(0.0, 0.0, 0.85)), 1) == pytest.approx(0.5)
    assert weighted("body_height", STILL, replace(standing, position=(0.0, 0.0, 0.5)), 1) == 0
    assert weighted("body_height", STILL, replace(STILL, start_height=0.5), 1) == pytest.approx(1.0)


def test_smooth_actions_costs_the_mean_squared_change_of_the_commands():
    before = replace(STILL, controls=(0.0, 0.5))
    assert weighted("smooth_actions", before, replace(before, controls=(1.0, 0.5)), -1) == pytest.approx(-0.5)
    assert weighted("smooth_actions", before, before, -1) == 0
    assert weighted("smooth_actions", STILL, before, -1) == 0


def test_feet_air_time_pays_long_landings_and_costs_shuffles_only_while_moving():
    walking = replace(STILL, speed=0.5, feet_down=(True, True), landed_air=(0.4, 0.0))
    assert weighted("feet_air_time", STILL, walking, 1) == pytest.approx(0.3)
    assert weighted("feet_air_time", STILL, replace(walking, landed_air=(2.0, 0.05)), 1) == pytest.approx(0.35)
    assert weighted("feet_air_time", STILL, replace(walking, speed=0.0), 1) == 0


def test_heading_and_drift_costs_turning_away_and_sideways_speed():
    assert weighted("heading_and_drift", STILL, STILL, -1) == 0
    assert weighted("heading_and_drift", STILL, replace(STILL, forward=(0.0, 1.0)), -1) == pytest.approx(-1.0)
    assert weighted("heading_and_drift", STILL, replace(STILL, velocity=(1.0, -0.3)), -1) == pytest.approx(-0.3)


def test_joint_limits_costs_the_share_of_joints_at_a_limit():
    assert weighted("joint_limits", STILL, replace(STILL, at_limits=0.25), -1) == pytest.approx(-0.25)
