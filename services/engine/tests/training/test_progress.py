from icarus.contracts.training import StartRun
from icarus.training.progress import RunProgress
from icarus.training.run_store import RunStore


def test_a_live_view_that_cannot_be_written_never_stops_training(tmp_path, parking_state, monkeypatch):
    store = RunStore(tmp_path)
    folder = store.folder(store.create(parking_state, StartRun(total_steps=10_000, copies=1), threads=1).run_id)
    progress = RunProgress(folder)

    def locked(_snapshot):
        raise PermissionError("Access is denied: live.json")

    monkeypatch.setattr(folder, "write_snapshot", locked)
    progress.snapshot(2048, ["car"], [{"positions": [[0.0, 0.0, 0.0]], "quaternions": [[1.0, 0.0, 0.0, 0.0]]}])
    progress.snapshot(4096, ["car"], [{"positions": [[0.0, 0.0, 0.0]], "quaternions": [[1.0, 0.0, 0.0, 0.0]]}])
    warnings = [line for line in folder.log() if line.level == "warn"]
    assert len(warnings) == 1 and "live view" in warnings[0].text
