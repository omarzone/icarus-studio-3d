from icarus.copilot.settings import settings_dir
from icarus.training.experiment_switches import EXPERIMENTS_FILE
from icarus.training.progress_watch import CheckpointResult, patience_steps, trend, watch


def results(*rows: tuple[int, float | None, float]) -> list[CheckpointResult]:
    return [
        CheckpointResult(step=step, success=success, episode_return=ret, instant_share=0.0)
        for step, success, ret in rows
    ]


def rules(found) -> set[str]:
    return {finding.rule for finding in found}


def test_a_run_that_stopped_improving_is_stalled():
    found = watch(
        results((0, 0.0, -10), (50_000, 0.1, -4), (100_000, 0.1, -4.1), (250_000, 0.05, -4.2), (500_000, 0.1, -4)), 0.8
    )

    assert rules(found) == {"stalled"}
    assert "3 checkpoints" in found[0].reason


def test_a_flat_run_before_its_patience_step_is_still_learning_not_stalled():
    rows = results((0, 0.0, -10), (25_000, 0.1, -4), (50_000, 0.1, -4.1), (100_000, 0.1, -4.2), (250_000, 0.1, -4))

    assert watch(rows, 0.8, patience=500_000) == []
    assert rules(watch(rows, 0.8, patience=250_000)) == {"stalled"}
    assert trend(rows, patience=500_000).call == "early"
    assert trend(rows, patience=250_000).call == "flat"


def test_patience_is_a_share_of_the_recommended_budget_less_what_the_brain_already_trained():
    assert patience_steps("navigation") == 500_000
    assert patience_steps("locomotion", inherited=300_000) == 700_000
    (settings_dir() / EXPERIMENTS_FILE).write_text('{"coach_patience": 0.2}', encoding="utf-8")
    assert patience_steps("navigation") == 200_000
    assert patience_steps("navigation", inherited=900_000) == 0


def test_a_run_still_improving_is_not_stalled():
    found = watch(
        results((0, 0.0, -10), (50_000, 0.1, -4), (100_000, 0.2, -3), (250_000, 0.3, -2), (500_000, 0.5, 1)), 0.8
    )

    assert found == []


def test_return_rising_while_the_goal_is_never_reached_is_reward_hacking():
    found = watch(results((0, 0.0, -10), (100_000, 0.0, 5), (250_000, 0.0, 20), (500_000, 0.0, 60)), 0.8)

    assert "reward_hacking" in rules(found)


def test_early_rising_return_without_success_is_still_learning():
    found = watch(results((0, 0.0, -10), (25_000, 0.0, -5), (50_000, 0.0, 0), (100_000, 0.0, 4)), 0.8)

    assert "reward_hacking" not in rules(found)


def test_episodes_ending_in_the_first_second_after_real_training_are_instant_failures():
    rows = [
        CheckpointResult(step=0, success=None, episode_return=0, instant_share=1.0),
        CheckpointResult(step=25_000, success=None, episode_return=1, instant_share=0.9),
        CheckpointResult(step=100_000, success=None, episode_return=1, instant_share=0.9),
    ]

    assert rules(watch(rows, 0.8)) == {"instant_failures"}
    # A brain that has barely trained still flails; that alone is not a reason to stop.
    assert watch(rows[:2], 0.8) == []


def test_a_walker_that_only_stands_while_its_return_climbs_is_reward_hacking():
    # Measured on a real walker run: from step 250,000 it stood all 30 s and drifted back instead of walking.
    rows = [
        CheckpointResult(step=step, success=0.0, episode_return=ret, instant_share=0.0)
        for step, ret in ((0, 7.03), (25_000, 6.63), (50_000, 4.54), (100_000, 9.19), (250_000, 143.95))
    ]

    assert rules(watch(rows, 0.8)) == {"reward_hacking"}


def test_three_evaluations_at_the_goal_hold_it():
    found = watch(results((0, 0.0, 0), (25_000, 0.85, 9), (50_000, 0.9, 9), (100_000, 0.8, 9)), 0.8)

    assert rules(found) == {"goal_held"}
    assert watch(results((0, 0.0, 0), (25_000, 0.85, 9), (50_000, 0.7, 9), (100_000, 0.9, 9)), 0.8) == []


def test_a_return_that_peaked_and_fell_back_is_not_reward_hacking():
    # Measured on a real walker run that kept falling after 1.2 s: the return peaked at 100,000 and dropped.
    found = watch(
        results((0, 0.0, -3.24), (25_000, 0.0, -3.1), (50_000, 0.0, -2.19), (100_000, 0.0, 5.66), (250_000, 0.0, 2.22)),
        0.8,
    )

    assert "reward_hacking" not in rules(found)
