from icarus.training.schedule import checkpoint_steps


def test_a_million_steps_follow_the_log_spaced_schedule():
    assert checkpoint_steps(1_000_000) == [0, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000]


def test_a_total_between_marks_ends_at_the_total():
    assert checkpoint_steps(300_000) == [0, 25_000, 50_000, 100_000, 250_000, 300_000]


def test_long_runs_keep_the_two_and_a_half_five_ten_pattern():
    assert checkpoint_steps(12_000_000)[-4:] == [2_500_000, 5_000_000, 10_000_000, 12_000_000]


def test_a_run_shorter_than_the_first_mark_has_the_untrained_and_final_checkpoints():
    assert checkpoint_steps(20_000) == [0, 20_000]
