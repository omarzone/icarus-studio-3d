from icarus.training.experiment_switches import EXPERIMENTS_FILE, read_experiments


def test_experiments_default_when_the_file_is_missing_unreadable_or_a_value_is_invalid(tmp_path):
    assert read_experiments(tmp_path).live_view == "realtime"
    path = tmp_path / EXPERIMENTS_FILE
    path.write_text("{not json", encoding="utf-8")
    assert read_experiments(tmp_path).live_view == "realtime"
    path.write_text('{"live_view": "sideways", "unknown": 1}', encoding="utf-8")
    assert read_experiments(tmp_path).live_view == "realtime"


def test_a_valid_switch_is_kept_next_to_keys_that_are_not_switches(tmp_path):
    (tmp_path / EXPERIMENTS_FILE).write_text('{"live_view": "fast", "retired": true}', encoding="utf-8")
    assert read_experiments(tmp_path).live_view == "fast"
