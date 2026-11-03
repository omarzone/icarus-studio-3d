import pytest

from icarus.contracts.training import StartRun
from icarus.sim.model_state import build_world, reset_world
from icarus.sim.views import ViewRenderer
from icarus.training import film_strip
from icarus.training.evaluation import EpisodeStates
from icarus.training.recording_export import export_path, export_recording
from icarus.training.run_store import RunStore


@pytest.mark.needs_gl
def test_a_kept_episode_exports_once_as_an_animated_png(tmp_path, parking_state):
    store = RunStore(tmp_path)
    folder = store.folder(store.create(parking_state, StartRun(total_steps=10_000, copies=1), threads=1).run_id)
    world = build_world(folder.project())
    reset_world(world)
    qpos = [world.data.qpos.copy() for _ in range(11)]
    film_strip.save_states(folder, 0, [EpisodeStates([0.1 * i for i in range(11)], qpos, None)])
    views = ViewRenderer()
    try:
        path = export_recording(folder, 0, 0, views)
        data = path.read_bytes()
        assert path == export_path(folder, 0, 0)
        assert data.startswith(b"\x89PNG") and b"acTL" in data and data.count(b"fcTL") >= 2
        assert export_recording(folder, 0, 0, views).read_bytes() == data
    finally:
        views.close()
