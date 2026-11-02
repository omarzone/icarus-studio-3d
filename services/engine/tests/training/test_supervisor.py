import os
import subprocess
import sys
import time
from collections.abc import Callable
from pathlib import Path

import pytest

from icarus.contracts.training import RunState, StartRun
from icarus.training.run_store import RunFolder, RunStore
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


def test_a_new_run_can_start_as_soon_as_the_last_one_is_done(tmp_path, parking_state):
    store = RunStore(tmp_path)
    supervisor = Supervisor(store, command=fake("linger"))
    first = supervisor.start(parking_state, START, threads=1, use_graphics_card=False)
    wait_for(state_is(store, first.run_id, "done"))
    assert supervisor.active_run() == first.run_id

    second = supervisor.start(parking_state, START, threads=1, use_graphics_card=False)
    assert supervisor.active_run() == second.run_id
    wait_for(lambda: supervisor.active_run() is None)
    assert store.folder(first.run_id).status().state == "done"


def test_stopping_a_run_that_just_finished_keeps_it_finished(tmp_path, parking_state, monkeypatch):
    store = RunStore(tmp_path)
    run = store.create(parking_state, START, threads=1)
    folder = store.folder(run.run_id)
    folder.write_status(folder.status().model_copy(update={"state": "done"}))
    stale = folder.status().model_copy(update={"state": "running"})
    reads = iter([stale])
    real_status = RunFolder.status
    monkeypatch.setattr(RunFolder, "status", lambda self: next(reads, None) or real_status(self))

    Supervisor(store).stop(run.run_id)
    assert folder.stored_status().state == "done"
    assert not folder.stop_requested()


DYING_ENGINE = """
import os, sys, time
from pathlib import Path
from icarus.contracts.training import StartRun
from icarus.training.run_store import RunFolder, RunStore
from icarus.training.supervisor import Supervisor
from tests.training.conftest import state_of

worker, mode, grace = sys.argv[1], sys.argv[2], sys.argv[3]
store = RunStore(Path(sys.argv[4]))
command = lambda run_dir, gpu: [sys.executable, worker, str(run_dir), mode, grace]
run = Supervisor(store, command=command).start(
    state_of("parking_car"), StartRun(total_steps=10_000, copies=1), threads=1, use_graphics_card=False
)
while store.folder(run.run_id).stored_status().state != "running":
    time.sleep(0.02)
print(run.run_id, flush=True)
os._exit(0)
"""


def run_in_dying_engine(tmp_path: Path, mode: str, grace: float) -> str:
    """Start a run from an engine process that then dies without shutting anything down."""
    args = [sys.executable, "-c", DYING_ENGINE, str(FAKE_WORKER), mode, str(grace), str(tmp_path)]
    result = subprocess.run(args, capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def test_a_worker_whose_engine_dies_stops_its_run_and_exits(tmp_path):
    store = RunStore(tmp_path)
    run_id = run_in_dying_engine(tmp_path, "obey", grace=60)
    folder = store.folder(run_id)
    wait_for(state_is(store, run_id, "stopped"))
    pid = folder.worker_pid()
    assert pid is not None
    wait_for(lambda: not alive(pid))


def test_a_worker_whose_engine_dies_ends_itself_after_a_grace_period_even_if_stuck(tmp_path):
    store = RunStore(tmp_path)
    run_id = run_in_dying_engine(tmp_path, "ignore", grace=1)
    folder = store.folder(run_id)
    # The worker writes its child's id once it starts; a slow machine can get here first.
    wait_for(lambda: (folder.path / "child.pid").exists())
    child = int((folder.path / "child.pid").read_text(encoding="utf-8"))
    wait_for(state_is(store, run_id, "stopped"))
    pid = folder.worker_pid()
    assert pid is not None
    wait_for(lambda: not alive(pid) and not alive(child))
    assert folder.status().finished_at is not None


def orphan(folder: RunFolder) -> subprocess.Popen[bytes]:
    """A worker left behind by an engine that closed, still training on its own."""
    process = subprocess.Popen(
        [sys.executable, str(FAKE_WORKER), str(folder.path), "ignore"],
        stdin=subprocess.PIPE,
        start_new_session=sys.platform != "win32",
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if sys.platform == "win32" else 0,
    )
    folder.write_worker_pid(process.pid)
    return process


def test_recovering_ends_a_worker_still_alive_from_a_closed_engine(tmp_path, parking_state):
    store = RunStore(tmp_path)
    folder = store.folder(store.create(parking_state, START, threads=1).run_id)
    process = orphan(folder)
    try:
        wait_for((folder.path / "child.pid").is_file)
        child = int((folder.path / "child.pid").read_text(encoding="utf-8"))
        Supervisor(store).recover()
        assert process.wait(timeout=10) is not None
        wait_for(lambda: not alive(child))
        status = folder.status()
        assert status.state == "failed" and status.failure is not None
    finally:
        if process.poll() is None:
            process.kill()


def test_recovering_never_ends_a_process_that_reused_the_worker_id(tmp_path, parking_state):
    store = RunStore(tmp_path)
    folder = store.folder(store.create(parking_state, START, threads=1).run_id)
    folder.write_worker_pid(os.getpid())
    Supervisor(store).recover()
    assert folder.status().state == "failed"
