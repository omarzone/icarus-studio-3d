from pathlib import Path

import pytest

from icarus.contracts.project import ProjectState
from icarus.contracts.training import StartRun
from icarus.projects.store import ProjectStore
from icarus.training.run_store import RunFolder, RunStore

BRAIN_STEP = 5_000


class Studio:
    """A project store and run store in a temporary folder, as the engine keeps them."""

    def __init__(self, root: Path) -> None:
        self.store = ProjectStore(root / "projects")
        self.runs = RunStore(root / "runs")

    def project(self, template: str) -> ProjectState:
        return self.store.create("Test Robot", template)

    def brain(self, state: ProjectState) -> RunFolder:
        """An ended run whose best checkpoint is an untrained PPO network: a real, if unskilled, brain."""
        from stable_baselines3 import PPO

        from icarus.sim.env import ProjectEnv

        start = StartRun.model_validate({"total_steps": 10_000, "copies": 1})
        folder = self.runs.folder(self.runs.create(state, start, threads=1).run_id)
        PPO("MlpPolicy", ProjectEnv(folder.project()), seed=0, device="cpu").save(folder.checkpoint_path(BRAIN_STEP))
        folder.write_status(folder.status().model_copy(update={"best_step": BRAIN_STEP, "state": "done"}))
        return folder


@pytest.fixture
def studio(tmp_path: Path) -> Studio:
    return Studio(tmp_path)
