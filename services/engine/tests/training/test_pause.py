import threading
import time
from pathlib import Path

import pytest

from icarus.training import callback
from icarus.training.callback import TrainingCallback
from icarus.training.run_store import RunFolder, RunStore
from icarus.training.supervisor import NotPausable, Supervisor
from tests.training.test_supervisor import START, fake, state_is, wait_for


class _Progress:
    def __init__(self, folder: RunFolder) -> None:
        self.folder = folder
        self.lines: list[str] = []

    def log(self, text: str) -> None:
        self.lines.append(text)


def _held(folder: RunFolder) -> tuple[TrainingCallback, _Progress]:
    """A callback with only what holding reads: its run folder, its log and its step."""
    hold = TrainingCallback.__new__(TrainingCallback)
    progress = _Progress(folder)
    hold.progress = progress  # type: ignore[assignment]
    hold.num_timesteps = 4_096
    hold._last_end = 0.0
    return hold, progress


def test_a_paused_worker_waits_between_steps_until_it_is_resumed(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(callback, "PAUSE_POLL", 0.01)
    folder = RunFolder(tmp_path)
    hold, progress = _held(folder)
    folder.request_pause()
    threading.Timer(0.2, folder.clear_pause).start()
    started = time.monotonic()
    hold._hold()
    assert time.monotonic() - started >= 0.2
    assert progress.lines[0].startswith("Paused at step 4,096")
    assert progress.lines[1].startswith("Resumed at step 4,096")
    # The time spent paused does not count toward the training speed.
    assert hold._last_end >= 0.2


def test_a_stop_ends_a_pause_without_resuming(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(callback, "PAUSE_POLL", 0.01)
    folder = RunFolder(tmp_path)
    hold, progress = _held(folder)
    folder.request_pause()
    threading.Timer(0.1, folder.request_stop).start()
    hold._hold()
    assert len(progress.lines) == 1 and folder.pause_requested()


def test_the_supervisor_pauses_and_resumes_the_run_training(tmp_path: Path, parking_state):
    store = RunStore(tmp_path)
    supervisor = Supervisor(store, command=fake("obey"))
    run = supervisor.start(parking_state, START, threads=1, use_graphics_card=False)
    wait_for(state_is(store, run.run_id, "running"))
    paused = supervisor.pause(run.run_id)
    assert paused.paused and paused.state == "running"
    assert store.folder(run.run_id).status().paused
    assert not supervisor.resume(run.run_id).paused
    supervisor.stop(run.run_id)
    wait_for(state_is(store, run.run_id, "stopped"))
    with pytest.raises(NotPausable, match="not training"):
        supervisor.pause(run.run_id)
    supervisor.shutdown(timeout=10)
