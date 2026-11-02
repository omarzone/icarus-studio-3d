import numpy as np
import pytest

from icarus.contracts.training import StartRun
from icarus.copilot.attachments import AttachmentStore
from icarus.copilot.client import capability_client
from icarus.copilot.early_look import EarlyLook, look_facts
from icarus.copilot.film_strips import FilmStrips
from icarus.copilot.settings import ModelSettingsStore, settings_dir
from icarus.projects.store import ProjectStore
from icarus.sim.policy import RandomPolicy
from icarus.sim.views import ViewRenderer
from icarus.training.progress import RunProgress
from icarus.training.progress_watch import checkpoint_results, trend
from icarus.training.run_health import run_health
from icarus.training.run_store import RunStore


class _Flailing:
    """Saves and predicts like a PPO model, moving the walker's six motors at random."""

    def __init__(self) -> None:
        self._policy = RandomPolicy(6, seed=1)

    def save(self, path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"checkpoint")

    def predict(self, observation, state=None, episode_start=None, deterministic=False):
        if observation.ndim == 2:
            return np.stack([self._policy.act(row) for row in observation]), None
        return self._policy.act(observation), None


@pytest.mark.live
@pytest.mark.needs_gl
def test_the_vision_model_judges_how_a_walker_moves_from_its_film_strip(tmp_path):
    vision = capability_client(ModelSettingsStore(settings_dir()), "vision")
    if vision is None:
        pytest.skip("no vision model is configured")
    projects, runs = ProjectStore(tmp_path / "projects"), RunStore(tmp_path / "runs")
    state = projects.state(projects.create("Walker", "walker_robot").project.id)
    folder = runs.folder(runs.create(state, StartRun(total_steps=50_000, copies=1), 1, evaluation_episodes=2).run_id)
    progress = RunProgress(folder)
    progress.checkpoint(_Flailing(), 25_000, 25_000)
    views = ViewRenderer()
    try:
        look = EarlyLook(lambda: (vision, True), FilmStrips(views, AttachmentStore(tmp_path / "projects")))
        results = checkpoint_results(folder)
        facts = look_facts(folder, 25_000, run_health(folder, 25_000), results, trend(results))
        result = look.look(folder, 25_000, facts, "en")
    finally:
        views.close()

    # A flailing walker falls within a second, so its strip has one frame per control step until then.
    assert result.strip is not None and len(result.strip.strip.frames) >= 10
    assert result.check.summary and result.check.gait
    assert all(item.area in ("reward", "sensors", "body", "world", "brain") for item in result.check.gait)
