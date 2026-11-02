import pytest

from icarus.contracts.training import StartRun, WarmStart
from icarus.sim.env import ProjectEnv
from icarus.training.run_store import RunStore
from icarus.training.supervisor import Supervisor, WarmStartRefused
from icarus.training.warm_start import warm_start_problem
from icarus.training.worker import train
from tests.training.conftest import quick, state_of

START = StartRun(total_steps=10_000, copies=1)


def _saved_brain(store: RunStore, state, step: int = 0) -> str:
    """A finished run whose checkpoint is a real, freshly initialized PPO brain."""
    from stable_baselines3 import PPO

    status = store.create(state, START, threads=1, evaluation_episodes=1)
    folder = store.folder(status.run_id)
    PPO("MlpPolicy", ProjectEnv(state.project), n_steps=64, batch_size=64, seed=3, device="cpu").save(
        folder.checkpoint_path(step)
    )
    folder.write_status(folder.stored_status().model_copy(update={"state": "done", "best_step": step}))
    return status.run_id


def test_a_warm_start_is_frozen_with_the_run(tmp_path, parking_state):
    store = RunStore(tmp_path)
    source = _saved_brain(store, parking_state)
    start = START.model_copy(update={"warm_start": WarmStart(run_id=source, step=0)})

    config = store.folder(store.create(parking_state, start, threads=1).run_id).config()

    assert config.warm_start == WarmStart(run_id=source, step=0)
    # A warm-started run counts its own steps: its checkpoint 0 is the inherited brain on the new revision.
    assert config.checkpoint_steps[0] == 0


def test_a_warm_started_worker_continues_from_the_saved_brain(tmp_path, parking_state, monkeypatch):
    import torch
    from stable_baselines3 import PPO

    from icarus.training.callback import TrainingCallback

    store = RunStore(tmp_path)
    source = _saved_brain(store, parking_state)
    start = START.model_copy(update={"warm_start": WarmStart(run_id=source, step=0)})
    folder = store.folder(store.create(quick(parking_state), start, threads=1, evaluation_episodes=1).run_id)
    monkeypatch.setattr(TrainingCallback, "_on_training_start", lambda callback: folder.request_stop())

    assert train(folder.path) == "stopped"

    inherited = PPO.load(store.folder(source).checkpoint_path(0), device="cpu").policy.state_dict()
    first = PPO.load(folder.checkpoint_path(0), device="cpu").policy.state_dict()
    assert all(torch.equal(inherited[key], first[key]) for key in inherited)
    assert any("Continuing from Run 1" in line.text for line in folder.log())


def test_the_supervisor_refuses_a_warm_start_from_a_body_that_senses_differently(tmp_path, parking_state):
    store = RunStore(tmp_path)
    source = _saved_brain(store, parking_state)
    walker = state_of("walker_robot", project_id=parking_state.project.id, revision=2)
    start = START.model_copy(update={"warm_start": WarmStart(run_id=source, step=0)})

    with pytest.raises(WarmStartRefused) as refused:
        Supervisor(store).start(walker, start, threads=1, use_graphics_card=False)

    assert "train from zero" in str(refused.value)
    assert len(store.list_runs(parking_state.project.id)) == 1


def test_the_supervisor_refuses_a_warm_start_without_that_checkpoint(tmp_path, parking_state):
    store = RunStore(tmp_path)
    source = _saved_brain(store, parking_state)
    start = START.model_copy(update={"warm_start": WarmStart(run_id=source, step=25_000)})

    with pytest.raises(WarmStartRefused) as refused:
        Supervisor(store).start(parking_state, start, threads=1, use_graphics_card=False)

    assert "25,000" in str(refused.value)


def test_a_warm_start_into_a_brain_of_another_size_is_refused(tmp_path, parking_state):
    store = RunStore(tmp_path)
    source = _saved_brain(store, parking_state)
    wider = quick(parking_state, layers=[512, 512])

    problem = warm_start_problem(store, wider.project, WarmStart(run_id=source, step=0))

    assert problem is not None and "512 and 512" in problem and "256 and 256" in problem
