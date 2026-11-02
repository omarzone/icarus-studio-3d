import subprocess
import sys
import time
from pathlib import Path
from statistics import mean

import pytest

from icarus.contracts.training import StartRun
from icarus.design.checks import design_report
from icarus.training.run_health import run_health
from icarus.training.run_store import RunStore
from tests.sim.conftest import with_term
from tests.training.conftest import state_of

STEPS = 60_000


def _train(root: Path, smooth: bool) -> tuple[float, list[str]]:
    state = state_of("walker_robot")
    if smooth:
        project = with_term(state.project, "smooth_actions", -0.2)
        state = state.model_copy(update={"project": project, "report": design_report(project)[0]})
    store = RunStore(root)
    status = store.create(state, StartRun(total_steps=STEPS, copies=2, seed=7), threads=2)
    folder = store.folder(status.run_id)
    started = time.monotonic()
    subprocess.run([sys.executable, "-m", "icarus.training.worker", str(folder.path)], check=True, timeout=1200)
    label = "with" if smooth else "without"
    print(f"{STEPS:,} walker steps {label} smooth_actions took {time.monotonic() - started:.0f} s")
    step = folder.checkpoints()[-1].step
    episodes = folder.episodes(step)
    assert episodes is not None
    gaits = [record.gait for record in episodes.episodes if record.gait is not None]
    assert gaits and all(len(gait.feet) == 2 for gait in gaits)
    kinds = [fact.kind for fact in run_health(folder, step)]
    return mean(gait.action_change for gait in gaits), kinds


@pytest.mark.slow
def test_smooth_actions_lowers_the_measured_action_change_of_a_briefly_trained_walker(tmp_path):
    plain, plain_facts = _train(tmp_path / "plain", smooth=False)
    smooth, smooth_facts = _train(tmp_path / "smooth", smooth=True)
    print(f"action change per step: {plain:.3f} without smooth_actions, {smooth:.3f} with it")
    assert "gait" in plain_facts and "gait" in smooth_facts
    assert smooth < plain
