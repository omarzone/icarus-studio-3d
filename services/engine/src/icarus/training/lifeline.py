"""The worker's tie to the engine that started it, so training never outlives the engine."""

import os
import sys
import threading
import time
from datetime import UTC, datetime

from icarus.contracts.training import LogLine
from icarus.training.process_tree import kill_tree
from icarus.training.run_store import TERMINAL_STATES, RunFolder

GRACE = 90.0
POLL_PERIOD = 1.0


def _wait_for_parent_to_close_stdin() -> None:
    if sys.platform == "win32":
        # A thread blocked reading stdin stalls native imports on Windows, so the pipe is polled instead.
        import _winapi
        import msvcrt

        handle = msvcrt.get_osfhandle(sys.stdin.fileno())
        while True:
            try:
                _winapi.PeekNamedPipe(handle, 0)
            except OSError:
                return
            time.sleep(POLL_PERIOD)
    while os.read(sys.stdin.fileno(), 4096):
        pass


def _outlive_parent(folder: RunFolder, grace: float) -> None:
    _wait_for_parent_to_close_stdin()
    folder.request_stop()
    time.sleep(grace)
    status = folder.stored_status()
    if status.state not in TERMINAL_STATES:
        elapsed = max(0.0, (datetime.now(UTC) - status.started_at).total_seconds())
        text = "The engine closed and the worker did not stop in time, so it ended itself"
        folder.append_log(LogLine(elapsed=elapsed, level="warn", text=text))
        folder.write_status(status.model_copy(update={"state": "stopped", "finished_at": datetime.now(UTC)}))
    kill_tree(os.getpid())
    os._exit(1)


def watch_parent(folder: RunFolder, grace: float = GRACE) -> None:
    """When the engine closes the worker's stdin, stop the run the normal way; end the worker if it hangs."""
    threading.Thread(target=_outlive_parent, args=(folder, grace), name="parent-watch", daemon=True).start()
