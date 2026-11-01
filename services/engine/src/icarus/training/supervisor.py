import subprocess
import sys
import threading
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path

from icarus.contracts.project import ProjectState
from icarus.contracts.training import LogLine, RunFailure, RunStatus, StartRun
from icarus.sim.env import ProjectEnv
from icarus.training.process_tree import end_worker, kill_tree
from icarus.training.run_store import TERMINAL_STATES, RunFolder, RunStore

STOP_TIMEOUT = 60.0
SHUTDOWN_TIMEOUT = 30.0
CONSOLE_LINES = 20

WorkerCommand = Callable[[Path, bool], list[str]]


class RunInProgress(Exception):
    def __init__(self, run_id: str) -> None:
        super().__init__(run_id)
        self.run_id = run_id


class NotTrainable(Exception):
    pass


def worker_command(run_dir: Path, use_graphics_card: bool) -> list[str]:
    device = "cuda" if use_graphics_card else "cpu"
    return [sys.executable, "-m", "icarus.training.worker", str(run_dir), "--device", device, "--exit-with-stdin"]


def _spawn(command: list[str], console: Path) -> subprocess.Popen[bytes]:
    """Start a worker as the leader of its own group, its stdin a pipe that closes when the engine goes away."""
    with console.open("wb") as output:
        if sys.platform == "win32":
            flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
            return subprocess.Popen(
                command, stdin=subprocess.PIPE, stdout=output, stderr=subprocess.STDOUT, creationflags=flags
            )
        return subprocess.Popen(
            command, stdin=subprocess.PIPE, stdout=output, stderr=subprocess.STDOUT, start_new_session=True
        )


@dataclass
class _Worker:
    folder: RunFolder
    process: subprocess.Popen[bytes]
    killed: bool = False
    killer: threading.Timer | None = None
    watcher: threading.Thread | None = None
    done: threading.Event = field(default_factory=threading.Event)


def _elapsed(status: RunStatus) -> float:
    return max(0.0, (datetime.now(UTC) - status.started_at).total_seconds())


def _has_checkpoint(folder: RunFolder) -> bool:
    return any((folder.path / "checkpoints").glob("*.zip"))


def _console_tail(folder: RunFolder) -> list[str]:
    path = folder.console_path
    if not path.is_file():
        return []
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    return [line for line in lines if line.strip()][-CONSOLE_LINES:]


class Supervisor:
    """Starts training workers as subprocesses, one at a time, and keeps their runs' state honest."""

    def __init__(
        self, store: RunStore, command: WorkerCommand = worker_command, stop_timeout: float = STOP_TIMEOUT
    ) -> None:
        self.store = store
        self._command = command
        self._stop_timeout = stop_timeout
        self._lock = threading.Lock()
        self._worker: _Worker | None = None

    def recover(self) -> None:
        """Runs still marked as training belong to an engine that closed; end any worker it left behind."""
        for status in self.store.all_runs():
            if status.state not in TERMINAL_STATES:
                folder = self.store.folder(status.run_id)
                pid = folder.worker_pid()
                if pid is not None:
                    end_worker(pid, folder.path)
                details = [line.text for line in folder.log()[-CONSOLE_LINES:]]
                self._end(folder, RunFailure(reason="The engine closed while this run was training.", details=details))

    def active_run(self) -> str | None:
        with self._lock:
            return self._worker.folder.run_id if self._worker else None

    def start(self, state: ProjectState, start: StartRun, threads: int, use_graphics_card: bool) -> RunStatus:
        try:
            ProjectEnv(state.project)
        except ValueError as error:
            raise NotTrainable(str(error)) from error
        with self._lock:
            # A worker whose run already ended may still be closing its copies; it no longer holds the slot.
            if self._worker is not None and self._worker.folder.stored_status().state not in TERMINAL_STATES:
                raise RunInProgress(self._worker.folder.run_id)
            status = self.store.create(state, start, threads)
            folder = self.store.folder(status.run_id)
            process = _spawn(self._command(folder.path, use_graphics_card), folder.console_path)
            folder.write_worker_pid(process.pid)
            worker = _Worker(folder, process)
            worker.watcher = threading.Thread(target=self._watch, args=(worker,), name="run-watch", daemon=True)
            self._worker = worker
            worker.watcher.start()
            return status

    def stop(self, run_id: str) -> RunStatus:
        folder = self.store.folder(run_id)
        if folder.status().state in TERMINAL_STATES:
            return folder.status()
        with self._lock:
            # Checked again under the lock: the worker may have finished the run since the read above.
            if folder.stored_status().state in TERMINAL_STATES:
                return folder.status()
            folder.request_stop()
            worker = self._worker if self._worker and self._worker.folder.run_id == run_id else None
            if worker is None:
                self._end(folder, None)
            elif worker.killer is None:
                worker.killer = threading.Timer(self._stop_timeout, self._kill, args=(worker,))
                worker.killer.daemon = True
                worker.killer.start()
        return folder.status()

    def shutdown(self, timeout: float = SHUTDOWN_TIMEOUT) -> None:
        """Ask the active worker to stop, wait for it, then kill whatever is left."""
        with self._lock:
            worker = self._worker
        if worker is None:
            return
        worker.folder.request_stop()
        if not worker.done.wait(timeout):
            self._kill(worker)
            worker.done.wait(timeout)

    def _kill(self, worker: _Worker) -> None:
        if worker.process.poll() is None:
            worker.killed = True
            kill_tree(worker.process.pid)

    def _watch(self, worker: _Worker) -> None:
        worker.process.wait()
        if worker.process.stdin is not None:
            worker.process.stdin.close()
        if worker.killer is not None:
            worker.killer.cancel()
        folder = worker.folder
        if folder.stored_status().state not in TERMINAL_STATES:
            if worker.killed and folder.stop_requested():
                status = folder.stored_status()
                text = "The worker did not stop in time and was ended"
                if _has_checkpoint(folder):
                    text += "; the run keeps its last checkpoint"
                folder.append_log(LogLine(elapsed=_elapsed(status), level="warn", text=text))
                self._end(folder, None)
            else:
                reason = "The training worker quit unexpectedly."
                self._end(folder, RunFailure(reason=reason, details=_console_tail(folder)))
        with self._lock:
            if self._worker is worker:
                self._worker = None
        worker.done.set()

    def _end(self, folder: RunFolder, failure: RunFailure | None) -> None:
        status = folder.stored_status()
        folder.write_status(
            status.model_copy(
                update={
                    "state": "failed" if failure else "stopped",
                    "failure": failure,
                    "finished_at": datetime.now(UTC),
                }
            )
        )
