import contextlib
import os
import subprocess
import sys
import time
from pathlib import Path

GONE_TIMEOUT = 10.0


def kill_tree(pid: int) -> None:
    """End a worker and its environment copies; the supervisor starts each worker as the leader of its own group."""
    if sys.platform == "win32":
        subprocess.run(
            ["taskkill", "/T", "/F", "/PID", str(pid)], capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW
        )
    else:
        import signal

        with contextlib.suppress(ProcessLookupError, PermissionError):
            os.killpg(pid, signal.SIGKILL)


def _command_line(pid: int) -> str | None:
    if sys.platform == "win32":
        query = (
            "[Console]::OutputEncoding = [Text.Encoding]::UTF8; "
            f"(Get-CimInstance Win32_Process -Filter 'ProcessId={pid}').CommandLine"
        )
        command = ["powershell", "-NoProfile", "-NonInteractive", "-Command", query]
        flags = subprocess.CREATE_NO_WINDOW
    elif sys.platform == "linux":
        try:
            return Path(f"/proc/{pid}/cmdline").read_bytes().replace(b"\0", b" ").decode(errors="replace")
        except OSError:
            return None
    else:
        command, flags = ["ps", "-p", str(pid), "-o", "command="], 0
    try:
        result = subprocess.run(command, capture_output=True, timeout=30, creationflags=flags)
    except (OSError, subprocess.SubprocessError):
        return None
    return result.stdout.decode("utf-8", errors="replace").strip() or None


def is_worker_of(pid: int, run_dir: Path) -> bool:
    """Whether a process is still the worker of this run, not another process that reused its id."""
    line = _command_line(pid)
    return line is not None and str(run_dir) in line


def end_worker(pid: int, run_dir: Path) -> None:
    """Kill a run's worker tree if it is still alive, and wait until it is gone so it cannot write again."""
    if not is_worker_of(pid, run_dir):
        return
    kill_tree(pid)
    deadline = time.monotonic() + GONE_TIMEOUT
    while is_worker_of(pid, run_dir) and time.monotonic() < deadline:
        time.sleep(0.1)
