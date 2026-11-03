import numpy as np
import pytest

from icarus.contracts.training import StartRun
from icarus.sim.policy import RandomPolicy
from icarus.training import episode_frames
from icarus.training.evaluation import evaluate
from icarus.training.progress import RunProgress
from icarus.training.run_store import RunStore
from tests.sim.conftest import project_from
from tests.sim.test_views import decoded
from tests.training.test_evaluation import SteerToSpot


def test_every_evaluation_episode_is_recorded_with_how_it_ended(parking):
    result = evaluate(parking, SteerToSpot(), episodes=4, step=0)

    assert [record.index for record in result.episodes] == [0, 1, 2, 3]
    assert [record.seed for record in result.episodes] == [10_000, 10_001, 10_002, 10_003]
    assert np.mean([record.success for record in result.episodes]) == result.success_rate
    for record in result.episodes:
        assert record.start_distance is not None and record.end_distance is not None
        if record.success:
            assert record.end_distance < record.start_distance and not record.fell
    assert result.episodes[0].seconds == pytest.approx(len(result.rollout.frames) * 0.05)


def test_only_the_first_two_episodes_keep_states_for_pictures(parking):
    result = evaluate(parking, RandomPolicy(4, seed=2), episodes=3, step=0)

    assert len(result.states) == 2
    first = result.states[0]
    # The state after reset and one per control step.
    assert len(first.qpos) == len(result.rollout.frames) + 1 == len(first.times)


def test_a_walker_records_how_far_it_went_forward():
    result = evaluate(project_from("walker_robot"), RandomPolicy(6, seed=0), episodes=1, step=0)

    record = result.episodes[0]
    assert record.start_distance is None and record.end_distance is None
    assert record.fell == result.rollout.outcome.startswith("Fell over")
    assert abs(record.forward) < 5


@pytest.mark.needs_gl
def test_a_checkpoint_stores_at_most_eight_pictures_of_its_first_episodes(tmp_path, parking_state):
    store = RunStore(tmp_path)
    folder = store.folder(store.create(parking_state, StartRun(total_steps=10_000, copies=1), 1, 3).run_id)
    progress = RunProgress(folder)

    progress.checkpoint(_RandomModel(), 0, 0)

    stored = folder.episodes(0)
    assert stored is not None and len(stored.episodes) == 3 and stored.has_goal
    names = [name for record in stored.episodes for name in record.frames]
    assert 4 <= len(names) <= 8
    assert all(not record.frames for record in stored.episodes[2:])
    first = stored.episodes[0]
    assert first.frames[0] == "e0-start.png" and first.frames[-1] in ("e0-end.png", "e0-failure.png")
    picture = decoded(folder.frame_path(0, first.frames[0]).read_bytes())
    assert picture.shape == (episode_frames.HEIGHT, episode_frames.WIDTH, 3) and picture.std() > 1
    assert first.sheet is not None and folder.frame_path(0, first.sheet).is_file()


def test_a_picture_that_cannot_be_rendered_never_stops_training(tmp_path, parking_state, monkeypatch):
    store = RunStore(tmp_path)
    folder = store.folder(store.create(parking_state, StartRun(total_steps=10_000, copies=1), 1, 2).run_id)
    progress = RunProgress(folder)

    def broken(*_args):
        raise RuntimeError("no OpenGL")

    monkeypatch.setattr(episode_frames, "render_frames", broken)
    progress.checkpoint(_RandomModel(), 0, 0)
    progress.checkpoint(_RandomModel(), 25_000, 25_000)

    assert [checkpoint.step for checkpoint in folder.checkpoints()] == [0, 25_000]
    stored = folder.episodes(25_000)
    assert stored is not None and all(not record.frames for record in stored.episodes)
    warnings = [line for line in folder.log() if line.level == "warn"]
    assert len(warnings) == 1 and "pictures" in warnings[0].text


class _RandomModel:
    """Saves and predicts like a PPO model, acting at random with a fixed seed."""

    def __init__(self) -> None:
        self._policy = RandomPolicy(4, seed=5)

    def save(self, path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"checkpoint")

    def predict(self, observation, state=None, episode_start=None, deterministic=False):
        # Like Stable-Baselines3, a batch of observations gets one action per row.
        if observation.ndim == 2:
            return np.stack([self._policy.act(row) for row in observation]), None
        return self._policy.act(observation), None
