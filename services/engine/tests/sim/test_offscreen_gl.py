import subprocess

import mujoco
import pytest

from icarus.design.compiler import compile_project
from icarus.library.templates import template_operations
from icarus.projects.operations import apply_operations, empty_project
from icarus.sim import offscreen_gl
from icarus.sim.views import RenderUnavailable, open_renderer


@pytest.fixture
def fresh_probe(monkeypatch):
    """A probe with nothing cached and no backend chosen, restored after the test."""
    for variable in ("MUJOCO_GL", offscreen_gl.SWITCH):
        # Set first so the variable is restored even when the probe sets it during the test.
        monkeypatch.setenv(variable, "")
        monkeypatch.delenv(variable)
    probe = offscreen_gl.backend_renders
    probe.cache_clear()
    yield
    probe.cache_clear()


def _no_subprocess(*_args, **_kwargs):
    raise AssertionError("the probe should not start a process")


@pytest.mark.parametrize(("variable", "value"), [("ICARUS_RENDERING", "off"), ("MUJOCO_GL", "disable")])
def test_rendering_switched_off_is_unavailable_without_probing(fresh_probe, monkeypatch, variable, value):
    monkeypatch.setenv(variable, value)
    monkeypatch.setattr(subprocess, "run", _no_subprocess)
    assert not offscreen_gl.rendering_available()


def test_a_driver_that_aborts_the_probe_leaves_this_process_running_and_rendering_off(fresh_probe, monkeypatch):
    monkeypatch.setattr(offscreen_gl, "PROBE", "import os\nos.abort()\n")
    assert not offscreen_gl.rendering_available()


def test_the_probe_runs_once_per_backend(fresh_probe, monkeypatch):
    calls: list[str | None] = []

    def probe(command, env, **_kwargs):
        calls.append(env.get("MUJOCO_GL"))
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setattr(subprocess, "run", probe)
    assert offscreen_gl.rendering_available() and offscreen_gl.rendering_available()
    assert calls == [None]


def test_on_linux_without_a_working_default_the_first_fallback_that_renders_is_chosen(fresh_probe, monkeypatch):
    monkeypatch.setattr(offscreen_gl.platform, "system", lambda: "Linux")
    monkeypatch.setattr(offscreen_gl, "_mujoco_imported", lambda: False)
    renders = {"": False, "egl": False, "osmesa": True}
    monkeypatch.setattr(offscreen_gl, "backend_renders", lambda backend: renders[backend])
    offscreen_gl.prepare_rendering()
    assert offscreen_gl.os.environ["MUJOCO_GL"] == "osmesa"


def test_a_backend_the_person_chose_is_kept(fresh_probe, monkeypatch):
    monkeypatch.setenv("MUJOCO_GL", "egl")
    monkeypatch.setattr(offscreen_gl.platform, "system", lambda: "Linux")
    monkeypatch.setattr(offscreen_gl, "_mujoco_imported", lambda: False)
    monkeypatch.setattr(offscreen_gl, "backend_renders", lambda backend: backend == "osmesa")
    offscreen_gl.prepare_rendering()
    assert offscreen_gl.os.environ["MUJOCO_GL"] == "egl"


def test_without_opengl_a_renderer_is_unavailable_and_no_context_is_created(fresh_probe, monkeypatch):
    monkeypatch.setenv(offscreen_gl.SWITCH, "off")

    def no_context(*_args):
        raise AssertionError("no GL context should be created")

    monkeypatch.setattr(mujoco, "Renderer", no_context)
    project = apply_operations(empty_project("000000000000", "Parking"), template_operations("parking_car"))
    with pytest.raises(RenderUnavailable, match="no OpenGL on this machine"):
        open_renderer(compile_project(project).model, 64, 48)
