from dataclasses import replace

import pytest

from icarus.library.rewards import REWARD_TERMS
from icarus.sim.rewards import TERM_FUNCTIONS, RewardState, compose

STILL = RewardState(
    position=(0.0, 0.0, 0.5),
    forward=(1.0, 0.0),
    up=1.0,
    goal=(10.0, 0.0, 0.0),
    goal_radius=1.0,
    colliding=False,
    fallen=False,
    effort=0.0,
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


def test_reach_goal_pays_once_when_entering_the_zone():
    inside = replace(STILL, position=(9.5, 0.0, 0.5))
    assert weighted("reach_goal", STILL, inside) == pytest.approx(10)
    assert weighted("reach_goal", inside, inside) == 0


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
