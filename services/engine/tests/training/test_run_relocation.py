import shutil
from datetime import UTC, datetime
from pathlib import Path

from icarus import cli
from icarus.api.app import projects_dir
from icarus.contracts.training import RunStatus
from icarus.training import run_relocation, run_store
from icarus.training.run_relocation import relocate_runs
from icarus.training.run_store import RunStore, runs_dir

RUN = "run-20260101T000000Z-ab12"
OTHER = "run-20260102T000000Z-cd34"


def _run(root: Path, run_id: str, checkpoint: bytes = b"weights") -> Path:
    folder = root / run_id
    (folder / "checkpoints").mkdir(parents=True)
    status = RunStatus(
        run_id=run_id,
        project_id="p1",
        revision_number=3,
        name="Run 1",
        state="done",
        step=1000,
        total_steps=1000,
        copies=1,
        steps_per_second=10.0,
        started_at=datetime(2026, 1, 1, tzinfo=UTC),
        best_step=1000,
    )
    (folder / "status.json").write_text(status.model_dump_json(), encoding="utf-8")
    (folder / "checkpoints" / "1000.zip").write_bytes(checkpoint)
    return folder


def test_a_run_moves_with_every_file_and_the_store_finds_it_in_the_new_folder(tmp_path):
    old, new = tmp_path / "old", tmp_path / "new"
    _run(old, RUN, b"trained brain")

    result = relocate_runs(old, new)

    assert result.moved == [RUN]
    assert not (old / RUN).exists()
    assert (new / RUN / "checkpoints" / "1000.zip").read_bytes() == b"trained brain"
    assert [status.run_id for status in RunStore(new).list_runs("p1")] == [RUN]
    assert [path.name for path in new.iterdir()] == [RUN]


def test_a_run_the_new_folder_already_has_is_left_alone_in_both(tmp_path):
    old, new = tmp_path / "old", tmp_path / "new"
    _run(old, RUN, b"old copy")
    _run(new, RUN, b"new copy")

    result = relocate_runs(old, new)

    assert result.moved == []
    assert (old / RUN / "checkpoints" / "1000.zip").read_bytes() == b"old copy"
    assert (new / RUN / "checkpoints" / "1000.zip").read_bytes() == b"new copy"


def test_an_unreadable_run_stays_where_it_was_and_the_others_still_move(tmp_path):
    old, new = tmp_path / "old", tmp_path / "new"
    _run(old, RUN)
    (old / RUN / "status.json").write_text("{not json", encoding="utf-8")
    _run(old, OTHER)

    result = relocate_runs(old, new)

    assert result.moved == [OTHER]
    assert (old / RUN / "status.json").is_file()
    assert result.skipped == [f"Left {RUN} in place: its status cannot be read"]


def test_a_copy_that_fails_keeps_the_original_and_leaves_nothing_behind(tmp_path, monkeypatch):
    old, new = tmp_path / "old", tmp_path / "new"
    _run(old, RUN, b"only copy")

    def broken_copy(source, destination):
        Path(destination).mkdir(parents=True)
        (Path(destination) / "status.json").write_text("half", encoding="utf-8")
        raise OSError("disk full")

    monkeypatch.setattr(run_relocation, "copytree", broken_copy)
    result = relocate_runs(old, new)

    assert result.moved == []
    assert result.skipped == [f"Left {RUN} in place: disk full"]
    assert (old / RUN / "checkpoints" / "1000.zip").read_bytes() == b"only copy"
    assert list(new.iterdir()) == []


def test_a_copy_that_does_not_match_is_discarded(tmp_path, monkeypatch):
    old, new = tmp_path / "old", tmp_path / "new"
    _run(old, RUN, b"original")
    real_copy = shutil.copytree

    def corrupting_copy(source, destination):
        real_copy(source, destination)
        (Path(destination) / "checkpoints" / "1000.zip").write_bytes(b"damaged!")

    monkeypatch.setattr(run_relocation, "copytree", corrupting_copy)
    result = relocate_runs(old, new)

    assert result.skipped == [f"Left {RUN} in place: the copy did not match the original"]
    assert (old / RUN / "checkpoints" / "1000.zip").read_bytes() == b"original"
    assert list(new.iterdir()) == []


def test_runs_live_next_to_the_projects_by_default(monkeypatch):
    monkeypatch.delenv("ICARUS_RUNS_DIR", raising=False)
    monkeypatch.delenv("ICARUS_PROJECTS_DIR", raising=False)
    assert runs_dir().parent == projects_dir().parent
    assert run_store.ENGINE_ROOT not in runs_dir().parents


def test_a_configured_runs_folder_never_receives_the_old_runs(tmp_path, monkeypatch):
    legacy = tmp_path / "legacy"
    _run(legacy, RUN)
    monkeypatch.setattr(run_store, "LEGACY_RUNS_DIR", legacy)
    monkeypatch.setenv("ICARUS_RUNS_DIR", str(tmp_path / "temporary"))

    cli.move_legacy_runs()

    assert (legacy / RUN / "status.json").is_file()
    assert not (tmp_path / "temporary").exists()
