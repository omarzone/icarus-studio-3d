import pytest

from icarus.sim.offscreen_gl import prepare_rendering, rendering_available

MODEL_VARIABLES = ("ICARUS_MODEL_ENDPOINT", "ICARUS_MODEL_API_KEY", "ICARUS_MODEL_REASONING", "ICARUS_MODEL_VISION")


@pytest.fixture(autouse=True)
def offline_copilot(request, monkeypatch, tmp_path_factory):
    """Every test answers from fixtures and keeps model settings in a temporary folder, unless it calls real models."""
    if request.node.get_closest_marker("live"):
        return
    monkeypatch.setenv("ICARUS_COPILOT_PROVIDER", "fake")
    monkeypatch.setenv("ICARUS_SETTINGS_DIR", str(tmp_path_factory.mktemp("settings")))
    for variable in MODEL_VARIABLES:
        monkeypatch.delenv(variable, raising=False)


@pytest.fixture(autouse=True)
def private_runs(monkeypatch, tmp_path_factory):
    """Runs default to the user's folder, and an engine started without a runs folder moves old runs into it."""
    monkeypatch.setenv("ICARUS_RUNS_DIR", str(tmp_path_factory.mktemp("runs")))


def pytest_configure(config):
    prepare_rendering()


def pytest_runtest_setup(item):
    if item.get_closest_marker("needs_gl") and not rendering_available():
        pytest.skip("no OpenGL on this machine")
