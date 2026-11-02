import json

import pytest

from icarus.contracts.training import CheckpointInfo, LogLine, MetricPoint, Rollout, RolloutFrame, StartRun
from icarus.training.run_store import RunStore, UnknownRun
from tests.training.conftest import state_of


def metric(kind, step, success=None) -> MetricPoint:
    return MetricPoint(
        kind=kind,
        step=step,
        elapsed=step / 1000,
        episode_return=step / 10_000,
        episode_length=600,
        success_rate=success,
        failure_rate=0.1 if success is not None else None,
        reward_terms={"reach_goal": 1.0},
    )


def test_a_new_run_freezes_its_config_revision_and_versions(tmp_path, parking_state):
    store = RunStore(tmp_path)
    status = store.create(parking_state, StartRun(total_steps=300_000, copies=4), threads=6)
    folder = store.folder(status.run_id)
    config = folder.config()
    assert status.state == "starting" and status.name == "Run 1" and status.step == 0
    assert (config.project_id, config.revision_number, config.copies, config.threads) == ("0123456789ab", 1, 4, 6)
    assert config.seed == parking_state.project.brain.seed
    assert config.checkpoint_steps[-1] == 300_000 and config.evaluation_episodes == 20
    assert folder.project() == parking_state.project
    meta = json.loads((folder.path / "meta.json").read_text(encoding="utf-8"))
    assert set(meta["versions"]) >= {"mujoco", "gymnasium", "stable-baselines3", "torch"}
    assert all(meta["versions"].values())


def test_runs_are_named_per_project_and_listed_newest_first(tmp_path, parking_state):
    store = RunStore(tmp_path)
    first = store.create(parking_state, StartRun(total_steps=10_000, copies=1, seed=1), threads=1)
    other = store.create(state_of("walker_robot", "fedcba987654"), StartRun(total_steps=10_000, copies=1), threads=1)
    second = store.create(parking_state, StartRun(total_steps=10_000, copies=1), threads=1)
    assert store.folder(first.run_id).config().seed == 1
    assert other.name == "Run 1" and second.name == "Run 2"
    assert [run.run_id for run in store.list_runs("0123456789ab")] == [second.run_id, first.run_id]
    assert [run.run_id for run in store.list_runs("fedcba987654")] == [other.run_id]


def test_unknown_or_malformed_run_ids_are_rejected(tmp_path):
    store = RunStore(tmp_path)
    for run_id in ("run-20260101T000000Z-abcd", "../etc", "training-settings.json"):
        with pytest.raises(UnknownRun):
            store.folder(run_id)


def test_metrics_round_trip_and_ignore_a_half_written_last_line(tmp_path, parking_state):
    store = RunStore(tmp_path)
    folder = store.folder(store.create(parking_state, StartRun(total_steps=10_000, copies=1), threads=1).run_id)
    points = [metric("eval", 0, 0.0), metric("train", 2048), metric("eval", 10_000, 0.5)]
    for point in points:
        folder.append_metric(point)
    with (folder.path / "metrics.jsonl").open("a", encoding="utf-8") as handle:
        handle.write('{"kind": "tra')
    assert folder.metrics() == points


def test_checkpoints_come_from_evaluations_and_know_whether_a_rollout_exists(tmp_path, parking_state):
    store = RunStore(tmp_path)
    folder = store.folder(store.create(parking_state, StartRun(total_steps=10_000, copies=1), threads=1).run_id)
    rollout = Rollout(
        step=0,
        seed=10_000,
        geoms=["car"],
        frames=[RolloutFrame(time=0.05, positions=[(0, 0, 0.3)], quaternions=[(1, 0, 0, 0)], reward=-0.01)],
        episode_return=-0.01,
        outcome="Time ran out",
    )
    folder.write_rollout(rollout)
    folder.append_metric(metric("eval", 0, 0.0))
    folder.append_metric(metric("train", 2048))
    folder.append_metric(metric("eval", 10_000, 0.5))
    assert folder.checkpoints() == [
        CheckpointInfo(step=0, episode_return=0.0, success_rate=0.0, failure_rate=0.1, has_rollout=True),
        CheckpointInfo(step=10_000, episode_return=1.0, success_rate=0.5, failure_rate=0.1, has_rollout=False),
    ]
    assert folder.rollout(0) == rollout
    assert folder.rollout(10_000) is None


def test_a_stop_request_shows_a_running_run_as_stopping(tmp_path, parking_state):
    store = RunStore(tmp_path)
    folder = store.folder(store.create(parking_state, StartRun(total_steps=10_000, copies=1), threads=1).run_id)
    folder.write_status(folder.status().model_copy(update={"state": "running"}))
    assert not folder.stop_requested()
    folder.request_stop()
    assert folder.stop_requested() and folder.status().state == "stopping"
    folder.write_status(folder.status().model_copy(update={"state": "stopped"}))
    assert folder.status().state == "stopped"


def test_log_lines_round_trip(tmp_path, parking_state):
    store = RunStore(tmp_path)
    folder = store.folder(store.create(parking_state, StartRun(total_steps=10_000, copies=1), threads=1).run_id)
    lines = [LogLine(elapsed=0.0, level="info", text="Training started"), LogLine(elapsed=1.5, level="warn", text="x")]
    for line in lines:
        folder.append_log(line)
    assert folder.log() == lines


def test_a_line_cut_off_by_a_killed_writer_is_skipped_and_later_lines_still_read(tmp_path, parking_state):
    store = RunStore(tmp_path)
    folder = store.folder(store.create(parking_state, StartRun(total_steps=10_000, copies=1), threads=1).run_id)
    first, second = metric("eval", 0, 0.0), metric("train", 2048)
    folder.append_metric(first)
    folder.append_log(LogLine(elapsed=0.0, level="info", text="Training started"))
    for name in ("metrics.jsonl", "worker.log"):
        with (folder.path / name).open("a", encoding="utf-8") as handle:
            handle.write('{"kind": "tra')
    folder.append_metric(second)
    folder.append_log(LogLine(elapsed=1.0, level="warn", text="The worker was ended"))
    assert folder.metrics() == [first, second]
    assert [line.text for line in folder.log()] == ["Training started", "The worker was ended"]
