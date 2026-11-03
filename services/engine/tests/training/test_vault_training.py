import subprocess
import sys
import time

import pytest

from icarus.contracts.training import StartRun
from icarus.design.checks import design_report
from icarus.library.body_vault import use_vault_body
from icarus.projects.operations import apply_operations
from icarus.training.run_store import RunStore
from tests.sim.conftest import project_from
from tests.training.conftest import state_of

STEPS = 30_000


@pytest.mark.slow
def test_the_vault_spider_trains_briefly_and_its_eight_feet_are_measured(tmp_path):
    empty = state_of("empty_world")
    project = apply_operations(project_from("empty_world"), use_vault_body(empty.project, "spider"))
    project = project.model_copy(update={"id": empty.project.id})
    report, _ = design_report(project)
    assert report.ok
    state = empty.model_copy(update={"project": project, "report": report})
    store = RunStore(tmp_path)
    status = store.create(state, StartRun(total_steps=STEPS, copies=2, seed=7), threads=2)
    folder = store.folder(status.run_id)
    started = time.monotonic()
    subprocess.run([sys.executable, "-m", "icarus.training.worker", str(folder.path)], check=True, timeout=1200)
    print(f"{STEPS:,} spider steps took {time.monotonic() - started:.0f} s")
    step = folder.checkpoints()[-1].step
    assert step > 0
    episodes = folder.episodes(step)
    assert episodes is not None and episodes.episodes
    gaits = [record.gait for record in episodes.episodes if record.gait is not None]
    assert gaits and all(len(gait.feet) == 8 for gait in gaits)
