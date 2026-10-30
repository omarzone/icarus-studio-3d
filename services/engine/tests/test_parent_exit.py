import socket
import subprocess
import sys
import time
import urllib.request


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _wait_healthy(port: int, timeout: float) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1)
            return
        except OSError:
            time.sleep(0.2)
    raise AssertionError("engine never became healthy")


def test_engine_exits_when_its_parent_closes_stdin():
    port = _free_port()
    proc = subprocess.Popen(
        [sys.executable, "-m", "icarus.cli", "--port", str(port), "--exit-with-stdin"],
        stdin=subprocess.PIPE,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        _wait_healthy(port, 30)
        assert proc.stdin is not None
        proc.stdin.close()
        assert proc.wait(timeout=10) == 0
    finally:
        if proc.poll() is None:
            proc.kill()
