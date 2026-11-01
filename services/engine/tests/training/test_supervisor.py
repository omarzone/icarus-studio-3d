import subprocess
import sys
import time
from collections.abc import Callable
from pathlib import Path

import pytest

from icarus.contracts.training import RunState, StartRun
from icarus.training.run_store import RunStore
from icarus.training.supervisor import NotTrainable, RunInProgress, Supervisor
from tests.training.conftest import state_of

FAKE_WORKER = Path(__file__).with_name("fake_worker.py")
START = StartRun(total_steps=10_000, copies=1)


def fake(mode: str) -> Callable[[Path, bool], list[str]]:
    return lambda run_dir, use_graphics_card: [sys.executable, str(FAKE_WORKER), str(run_dir), mode]


def wait_for(condition: Callable[[], bool], timeout: float = 30.0) -> None:
    deadline = time.monotonic() + timeout
    while not condition():
        if time.monotonic() > deadline:
            raise AssertionError("Timed out")
        time.sleep(0.02)


def state_is(store: RunStore, run_id: str, *states: RunState) -> Callable[[], bool]:
    return lambda: store.folder(run_id).status().state in states


def alive(pid: int) -> bool:
    if sys.platform == "win32":
        listed = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH"], capture_output=True, text=True).stdout
        return str(pid) in listed
    try:
        import os

        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    return True


def test_one_run_trains_at_a_time_and_a_stopped_worker_frees_the_slot(tmp_path, parking_state):
    store = RunStore(tmp_path)
    supervisor = Supervisor(store, command=fake("obey"))
    run = supervisor.start(parking_state, START, threads=2, use_graphics_card=False)
    wait_for(state_is(store, run.run_id, "running"))
    with pytest.raises(RunInProgress):
        supervisor.start(parking_state, START, threads=2, use_graphics_card=False)

    assert supervisor.stop(run.run_id).state == "stopping"
    wait_for(state_is(store, run.run_id, "stopped"))
    wait_for(lambda: supervisor.active_run() is None)

    second = supervisor.start(parking_state, START, threads=2, use_graphics_card=False)
    assert second.name == "Run 2"
    supervisor.shutdown(timeout=10)
    assert store.folder(second.run_id).status().state == "stopped"


def test_a_worker_that_dies_marks_its_run_failed_with_its_output(tmp_path, parking_state):
    store = RunStore(tmp_path)
    run = Supervisor(store, command=fake("crash")).start(parking_state, START, threads=1, use_graphics_card=False)
    wait_for(state_is(store, run.run_id, "failed"))
    status = store.folder(run.run_id).status()
    assert status.failure is not None and status.finished_at is not None
    assert "quit unexpectedly" in status.failure.reason
    assert any("crashed on purpose" in line for line in status.failure.details)


def test_a_worker_that_ignores_stop_is_killed_with_its_children(tmp_path, parking_state):
    store = RunStore(tmp_path)
    supervisor = Supervisor(store, command=fake("ignore"), stop_timeout=0.5)
    run = supervisor.start(parking_state, START, threads=1, use_graphics_card=False)
    child_file = store.folder(run.run_id).path / "child.pid"
    wait_for(child_file.is_file)
    child = int(child_file.read_text(encoding="utf-8"))
    supervisor.stop(run.run_id)
    wait_for(state_is(store, run.run_id, "stopped"))
    wait_for(lambda: not alive(child))
    assert store.folder(run.run_id).status().finished_at is not None
    assert "did not stop" in store.folder(run.run_id).log()[-1].text


def test_runs_left_training_by_a_closed_engine_are_marked_failed(tmp_path, parking_state):
    store = RunStore(tmp_path)
    run = store.create(parking_state, START, threads=1)
    folder = store.folder(run.run_id)
    folder.write_status(folder.status().model_copy(update={"state": "running"}))
    Supervisor(store).recover()
    status = folder.status()
    assert status.state == "failed" and status.failure is not None
    assert "engine closed" in status.failure.reason


def test_a_project_without_a_body_task_cannot_start(tmp_path):
    with pytest.raises(NotTrainable):
        Supervisor(RunStore(tmp_path), command=fake("obey")).start(
            state_of("empty_world"), START, threads=1, use_graphics_card=False
        )
    assert list(tmp_path.iterdir()) == []
