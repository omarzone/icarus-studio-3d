"""Whether this machine can render offscreen, found out in a child process so a GL driver that aborts never takes
the engine down. Only the standard library is imported here: MuJoCo reads MUJOCO_GL once, when it is imported."""

import os
import platform
import subprocess
import sys
from functools import cache

SWITCH = "ICARUS_RENDERING"
OFF = ("off", "0", "false", "disable", "disabled")
PROBE_SECONDS = 60
PROBE = (
    "import mujoco\n"
    "model = mujoco.MjModel.from_xml_string('<mujoco><worldbody><geom size=\"1\"/></worldbody></mujoco>')\n"
    "renderer = mujoco.Renderer(model, 8, 8)\n"
    "renderer.render()\n"
    "renderer.close()\n"
)
# Without a display the default Linux backend (GLFW) fails, while EGL or OSMesa may still render.
LINUX_FALLBACKS = ("egl", "osmesa")


def _chosen_backend() -> str:
    return os.environ.get("MUJOCO_GL", "").strip().lower()


def _switched_off() -> bool:
    return os.environ.get(SWITCH, "").strip().lower() in OFF or _chosen_backend() in OFF


def _mujoco_imported() -> bool:
    return "mujoco" in sys.modules


@cache
def backend_renders(backend: str) -> bool:
    """Whether a child process can render one frame with this MUJOCO_GL backend ("" is MuJoCo's default)."""
    env = {name: value for name, value in os.environ.items() if name != "MUJOCO_GL"}
    if backend:
        env["MUJOCO_GL"] = backend
    try:
        done = subprocess.run(
            [sys.executable, "-I", "-c", PROBE],
            env=env,
            capture_output=True,
            timeout=PROBE_SECONDS,
            check=False,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return done.returncode == 0


def rendering_available() -> bool:
    """Whether the backend this process uses can render; probed once per backend and process."""
    return not _switched_off() and backend_renders(_chosen_backend())


def prepare_rendering() -> None:
    """On Linux, pick a fallback backend that renders when the default does not; call before importing MuJoCo."""
    if _mujoco_imported() or "MUJOCO_GL" in os.environ or _switched_off() or platform.system() != "Linux":
        return
    if backend_renders(""):
        return
    for backend in LINUX_FALLBACKS:
        if backend_renders(backend):
            os.environ["MUJOCO_GL"] = backend
            return
