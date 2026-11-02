from datetime import UTC, datetime

import pytest

from icarus.contracts.training import LogLine, MetricPoint, RunStatus
from icarus.training.episodes import CheckpointEpisodes, EpisodeRecord, GaitSignals
from icarus.training.progress_watch import CheckpointResult, trend
from icarus.training.run_health import (
    episode_facts,
    failure_trend,
    gait_facts,
    log_facts,
    reward_facts,
    speed_fact,
)

# The beginner's ball-pushing tank at its untrained checkpoint: facing the goal and staying up pay almost everything.
TANK_TERMS = {
    "reach_goal": 0.0,
    "progress_to_goal": 0.03212,
    "heading_alignment": 144.23787,
    "stay_upright": 115.62466,
    "collision_penalty": 0.0,
    "time_penalty": -12.0,
}


def record(index: int, **fields) -> EpisodeRecord:
    values = {
        "index": index,
        "seed": 10_000 + index,
        "success": False,
        "fell": False,
        "seconds": 30.0,
        "episode_return": 250.0,
        "start_distance": 8.85,
        "end_distance": 8.84,
        "forward": 0.01,
    }
    return EpisodeRecord.model_validate(values | fields)


def episodes(step: int, *records: EpisodeRecord, has_goal: bool = True) -> CheckpointEpisodes:
    return CheckpointEpisodes(step=step, has_goal=has_goal, episode_seconds=30.0, episodes=list(records))


def evaluation(step: int, terms: dict[str, float], ret: float, success: float = 0.0, failure: float = 0.0):
    return MetricPoint(
        kind="eval",
        step=step,
        elapsed=1.0,
        episode_return=ret,
        episode_length=600,
        success_rate=success,
        failure_rate=failure,
        reward_terms=terms,
    )


def test_reward_paid_without_doing_the_task_is_flagged_with_its_terms_and_shares():
    still = episodes(0, record(0), record(1))
    facts = reward_facts(evaluation(0, TANK_TERMS, 247.89), still)
    assert len(facts) == 1 and facts[0].kind == "reward_dominance" and facts[0].problem
    text = facts[0].text
    assert "heading_alignment (144.24" in text and "stay_upright (115.62" in text
    assert "247.89" in text and "0.01 m closer" in text


def test_a_balanced_reward_or_a_succeeding_brain_is_not_flagged():
    balanced = {"a": 20.0, "b": 20.0, "c": 20.0, "d": 20.0, "time_penalty": -20.0}
    moving = episodes(50_000, record(0, end_distance=4.0), record(1, end_distance=5.0))
    assert reward_facts(evaluation(50_000, TANK_TERMS, 247.89), moving) == []
    assert reward_facts(evaluation(0, balanced, 88.0), episodes(0, record(0))) == []
    assert reward_facts(evaluation(50_000, TANK_TERMS, 247.89, success=0.2), episodes(0, record(0))) == []


def test_episodes_that_touch_a_flat_object_are_reported_with_when_and_its_height():
    touched = episodes(
        50_000,
        record(0, touched="Linea central", touched_at=8.0),
        record(1, touched="Linea central", touched_at=9.0),
        record(2),
        record(3, touched="Wall", touched_at=2.0),
    )
    facts = episode_facts(touched)
    touches = [fact for fact in facts if fact.kind == "touches"]
    assert len(touches) == 1 and touches[0].problem
    assert "3 of 4 episodes touched an object: Linea central in 2 (first at 8.5 s" in touches[0].text
    assert "Wall in 1 (first at 2.0 s" in touches[0].text


def test_episodes_that_end_early_and_a_body_that_does_not_move_are_reported():
    ended = episodes(
        25_000,
        record(0, fell=True, seconds=0.6),
        record(1, fell=True, seconds=0.8),
        record(2, touched="Wall", touched_at=3.0, seconds=3.0),
        record(3),
    )
    kinds = {fact.kind: fact for fact in episode_facts(ended)}
    assert "3 of 4 episodes ended after 1.5 s" in kinds["ends_early"].text
    assert "2 fell, 1 touched" in kinds["ends_early"].text
    # An untrained brain that barely moves is normal; after real training it hints at a problem.
    assert not kinds["no_motion"].problem
    assert next(f for f in episode_facts(episodes(250_000, record(0))) if f.kind == "no_motion").problem


def test_the_log_reports_errors_warnings_and_signs_of_instability():
    log = [
        LogLine(elapsed=1.0, level="info", text="Training 300,000 steps"),
        LogLine(elapsed=2.0, level="warn", text="Episode pictures could not be rendered (no GL); training goes on"),
    ]
    facts = log_facts(log, ["MuJoCo Warning: Nan, Inf or huge value in QACC at DOF 3."])
    kinds = {fact.kind: fact for fact in facts}
    assert set(kinds) == {"log_warning", "unstable"}
    assert "could not be rendered" in kinds["log_warning"].text and kinds["unstable"].problem


def test_slow_training_says_how_long_the_rest_takes():
    status = RunStatus(
        run_id="r",
        project_id="p",
        revision_number=1,
        name="Run 1",
        state="running",
        step=100_000,
        total_steps=300_000,
        copies=4,
        steps_per_second=100.0,
        started_at=datetime.now(UTC),
    )
    fact = speed_fact(status)
    assert fact is not None and "100 steps/s" in fact.text and "33 minutes" in fact.text
    assert speed_fact(status.model_copy(update={"steps_per_second": 1600.0})) is None


def test_failures_that_stay_high_are_not_dropping():
    rising = [evaluation(50_000, {}, 1.0, failure=0.35), evaluation(100_000, {}, 1.0, failure=1.0)]
    falling = [evaluation(50_000, {}, 1.0, failure=0.9), evaluation(100_000, {}, 1.0, failure=0.4)]
    fact = failure_trend(rising)
    assert fact is not None and "35% at step 50,000" in fact.text
    assert failure_trend(falling) is None


def gait(**fields) -> GaitSignals:
    values = {
        "height_mean": 0.95,
        "height_spread": 0.03,
        "start_height": 1.0,
        "tilt_mean": 8.0,
        "turn_mean": 5.0,
        "forward_speed": 0.5,
        "drift": 0.2,
        "feet": [
            {"name": "Rear-left foot", "contact_share": 0.6, "lift_offs": 20},
            {"name": "Rear-right foot", "contact_share": 0.55, "lift_offs": 21},
        ],
        "airborne_share": 0.45,
        "flight_share": 0.02,
        "joints_at_limits": 0.05,
        "action_change": 0.08,
    }
    return GaitSignals.model_validate(values | fields)


def walking(step: int, *gaits: GaitSignals) -> CheckpointEpisodes:
    records = [record(index, forward=15.0, gait=item) for index, item in enumerate(gaits)]
    return episodes(step, *records, has_goal=False)


def test_a_good_gait_gives_only_its_summary_with_the_numbers():
    facts = gait_facts(walking(50_000, gait(), gait()))
    assert [fact.kind for fact in facts] == ["gait"]
    assert "root at 0.95 m" in facts[0].text and "0.50 m/s forward" in facts[0].text
    assert not facts[0].problem


def test_a_dragged_foot_names_the_foot_and_its_contact_share():
    dragging = gait(feet=[{"name": "Rear-left foot", "contact_share": 0.98, "lift_offs": 0}])
    facts = gait_facts(walking(250_000, dragging), settled=True)
    dragged = next(fact for fact in facts if fact.kind == "foot_dragged")
    assert "rear-left foot touches the ground 98% of the time" in dragged.text and "(dragged)" in dragged.text
    assert dragged.problem and dragged.value == pytest.approx(0.98)


def test_crawling_hopping_twitching_locked_joints_and_drift_are_each_reported():
    poor = gait(height_mean=0.4, flight_share=0.5, action_change=0.6, joints_at_limits=0.5, drift=9.0)
    kinds = {fact.kind: fact for fact in gait_facts(walking(50_000, poor))}
    assert {"body_low", "hopping", "twitching", "joints_at_limits", "drifting"} <= set(kinds)
    assert kinds["body_low"].value == pytest.approx(0.4) and "40% of its start height" in kinds["body_low"].text
    assert not kinds["twitching"].problem


def test_episodes_recorded_before_gait_signals_give_no_gait_facts():
    assert gait_facts(episodes(50_000, record(0), has_goal=False)) == []


def results(*rows: tuple[int, float, float]) -> list[CheckpointResult]:
    return [CheckpointResult(step, success, ret, 0.0) for step, success, ret in rows]


def test_the_learning_curve_says_more_steps_while_success_climbs_and_a_fix_when_it_is_flat():
    assert trend(results((0, 0.0, 1.0), (25_000, 0.0, 2.0), (50_000, 0.0, 2.0))).call == "early"
    climbing = trend(results((0, 0.0, 1.0), (25_000, 0.1, 2.0), (50_000, 0.2, 3.0), (100_000, 0.4, 5.0)))
    assert climbing.call == "improving" and "more steps should help" in climbing.reason
    flat = trend(results((0, 0.0, 248.0), (50_000, 0.0, 261.0), (100_000, 0.0, 260.0), (250_000, 0.0, 260.0)))
    assert flat.call == "flat" and "a fix should" in flat.reason
