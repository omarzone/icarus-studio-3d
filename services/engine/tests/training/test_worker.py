import subprocess
import sys
import time

import pytest

from icarus.contracts.training import StartRun
from icarus.training.run_store import RunStore
from icarus.training.worker import train
from tests.training.conftest import quick, state_of

SHORT = StartRun(total_steps=10_000, copies=1)


def test_a_stop_request_ends_the_run_stopped_with_a_final_evaluated_checkpoint(tmp_path, parking_state, monkeypatch):
    from icarus.training.callback import TrainingCallback

    store = RunStore(tmp_path)
    status = store.create(quick(parking_state), SHORT, threads=1, evaluation_episodes=1)
    folder = store.folder(status.run_id)
    monkeypatch.setattr(TrainingCallback, "_on_training_start", lambda callback: folder.request_stop())

    assert train(folder.path) == "stopped"

    final = folder.status()
    assert final.state == "stopped" and final.finished_at is not None
    assert 0 < final.step < 10_000
    # Stop answers during practice instead of waiting for the rollout to fill.
    assert final.step < quick(parking_state).project.brain.ppo.n_steps
    steps = [checkpoint.step for checkpoint in folder.checkpoints()]
    assert steps == [0, final.step]
    assert all(folder.checkpoint_path(step).is_file() and folder.rollout(step) for step in steps)
    assert final.best_step in steps
    assert any("stop" in line.text.lower() for line in folder.log())


def test_a_stop_requested_before_training_starts_ends_the_run_without_training(tmp_path, parking_state):
    store = RunStore(tmp_path)
    status = store.create(quick(parking_state), SHORT, threads=1, evaluation_episodes=1)
    folder = store.folder(status.run_id)
    folder.request_stop()

    assert train(folder.path) == "stopped"

    final = folder.status()
    assert final.state == "stopped" and final.step == 0 and final.best_step is None
    assert folder.checkpoints() == []


def test_a_project_that_cannot_train_fails_with_a_plain_reason(tmp_path):
    store = RunStore(tmp_path)
    status = store.create(state_of("empty_world"), StartRun(total_steps=10_000, copies=1), threads=1)
    folder = store.folder(status.run_id)

    assert train(folder.path) == "failed"

    final = folder.status()
    assert final.state == "failed" and final.failure is not None and final.finished_at is not None
    assert "navigation and locomotion" in final.failure.reason
    assert final.failure.details
    assert folder.log()[-1].level == "error"


def test_the_worker_trains_the_network_and_settings_frozen_with_the_run(tmp_path, parking_state, monkeypatch):
    from stable_baselines3 import PPO

    from icarus.training.callback import TrainingCallback

    store = RunStore(tmp_path)
    state = quick(parking_state, layers=[32, 16, 8])
    state.project.brain.ppo.learning_rate = 1e-3
    state.project.brain.ppo.ent_coef = 0.01
    status = store.create(state, StartRun(total_steps=10_000, copies=1), threads=1, evaluation_episodes=1)
    folder = store.folder(status.run_id)
    monkeypatch.setattr(TrainingCallback, "_on_training_start", lambda callback: folder.request_stop())

    assert train(folder.path) == "stopped"

    model = PPO.load(folder.checkpoint_path(0), device="cpu")
    linear = [layer.out_features for layer in model.policy.mlp_extractor.policy_net if hasattr(layer, "out_features")]
    assert linear == [32, 16, 8]
    assert (model.learning_rate, model.ent_coef, model.n_steps, model.n_epochs) == (1e-3, 0.01, 64, 1)


@pytest.mark.slow
def test_training_the_parking_car_for_twenty_thousand_steps_with_two_copies(tmp_path, parking_state):
    store = RunStore(tmp_path)
    status = store.create(parking_state, StartRun(total_steps=20_000, copies=2), threads=2)
    folder = store.folder(status.run_id)
    started = time.monotonic()

    subprocess.run([sys.executable, "-m", "icarus.training.worker", str(folder.path)], check=True, timeout=900)

    print(f"20k steps with 2 copies took {time.monotonic() - started:.1f} s")
    final = folder.status()
    assert final.state == "done" and final.step >= 20_000 and final.steps_per_second > 0
    assert [checkpoint.step for checkpoint in folder.checkpoints()] == [0, 20_000]
    assert sorted(path.name for path in (folder.path / "rollouts").iterdir()) == ["0.json", "20000.json"]
    assert all(folder.checkpoint_path(step).is_file() for step in (0, 20_000))
    evaluations = [point for point in folder.metrics() if point.kind == "eval"]
    training = [point for point in folder.metrics() if point.kind == "train"]
    assert [point.step for point in evaluations] == [0, 20_000]
    assert training and all(point.steps_per_second and point.success_rate is not None for point in training)
    assert [point.step for point in training] == sorted(point.step for point in training)
    snapshot = folder.snapshot()
    assert snapshot is not None and len(snapshot.copies) == 2
    assert all(len(copy.positions) == len(snapshot.geoms) for copy in snapshot.copies)
