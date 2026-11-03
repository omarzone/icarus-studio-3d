import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from icarus.api.app import create_app
from icarus.contracts.storage import ChangeDataFolder, DataFolderMove
from icarus.contracts.training import StartRun
from icarus.projects.store import ProjectStore
from icarus.storage.data_folder import data_folder, projects_dir, runs_dir, save_data_folder
from icarus.storage.data_folder_move import DataFolderMover, MoveRefused
from icarus.training.run_store import RunStore
from icarus.training.supervisor import NotTrainable, Supervisor
from tests.storage.test_relocation import RUN, _run


@pytest.fixture
def chosen_folders(monkeypatch, tmp_path):
    """No folder set by the environment, so the saved data folder decides; settings live in a temporary folder."""
    monkeypatch.delenv("ICARUS_PROJECTS_DIR", raising=False)
    monkeypatch.delenv("ICARUS_RUNS_DIR", raising=False)
    settings = tmp_path / "settings"
    monkeypatch.setenv("ICARUS_SETTINGS_DIR", str(settings))
    return settings


class _Holds:
    def __init__(self) -> None:
        self.reasons: list[str | None] = []

    def __call__(self, reason: str | None) -> None:
        self.reasons.append(reason)


def _mover(old: Path, settings: Path, busy: str | None = None, app_root: Path | None = None):
    holds = _Holds()
    mover = DataFolderMover(
        old / "projects", old / "runs", lambda: busy, holds, settings, app_root=app_root or old.parent / "app"
    )
    return mover, holds


def _finished(mover: DataFolderMover) -> DataFolderMove:
    deadline = time.monotonic() + 20
    while mover.status().state == "moving" and time.monotonic() < deadline:
        time.sleep(0.01)
    return mover.status()


def test_the_saved_data_folder_holds_projects_and_runs_and_the_environment_still_wins(
    chosen_folders, monkeypatch, tmp_path
):
    save_data_folder(tmp_path / "big disk")

    assert data_folder() == tmp_path / "big disk"
    assert projects_dir() == tmp_path / "big disk" / "projects"
    assert runs_dir() == tmp_path / "big disk" / "runs"
    monkeypatch.setenv("ICARUS_PROJECTS_DIR", str(tmp_path / "test projects"))
    assert projects_dir() == tmp_path / "test projects"


def test_projects_and_runs_move_byte_for_byte_and_the_engine_finds_them_in_the_new_folder(chosen_folders, tmp_path):
    old, new = tmp_path / "old", tmp_path / "new"
    project = ProjectStore(old / "projects").create("Parking", "parking_car").project.id
    _run(old / "runs", RUN, b"trained brain")
    (old / "runs" / "training.json").write_text('{"threads": 2}', encoding="utf-8")
    new.mkdir()
    mover, holds = _mover(old, chosen_folders)

    mover.start(ChangeDataFolder(folder=str(new), move_data=True))
    move = _finished(mover)

    assert move.state == "done"
    assert move.restart_needed
    assert data_folder() == new.resolve()
    assert [summary.id for summary in ProjectStore(new / "projects").list_projects()] == [project]
    assert (new / "runs" / RUN / "checkpoints" / "1000.zip").read_bytes() == b"trained brain"
    assert (new / "runs" / "training.json").read_text(encoding="utf-8") == '{"threads": 2}'
    assert list((old / "projects").iterdir()) == []
    assert list((old / "runs").iterdir()) == []
    assert holds.reasons[0] is not None and holds.reasons[-1] is None


def test_starting_empty_keeps_the_old_data_where_it_is(chosen_folders, tmp_path):
    old, new = tmp_path / "old", tmp_path / "new"
    _run(old / "runs", RUN)
    new.mkdir()
    mover, _ = _mover(old, chosen_folders)

    mover.start(ChangeDataFolder(folder=str(new), move_data=False))

    assert _finished(mover).state == "done"
    assert (old / "runs" / RUN / "status.json").is_file()
    assert data_folder() == new.resolve()


def test_an_entry_the_new_folder_already_has_stays_in_the_old_one_and_is_reported(chosen_folders, tmp_path):
    old, new = tmp_path / "old", tmp_path / "new"
    _run(old / "runs", RUN, b"old copy")
    _run(new / "runs", RUN, b"new copy")
    mover, _ = _mover(old, chosen_folders)

    mover.start(ChangeDataFolder(folder=str(new), move_data=True))
    move = _finished(mover)

    assert (old / "runs" / RUN / "checkpoints" / "1000.zip").read_bytes() == b"old copy"
    assert (new / "runs" / RUN / "checkpoints" / "1000.zip").read_bytes() == b"new copy"
    assert any(RUN in line and "already has one" in line for line in move.lines)


def test_nothing_moves_while_a_run_trains(chosen_folders, tmp_path):
    old, new = tmp_path / "old", tmp_path / "new"
    _run(old / "runs", RUN)
    new.mkdir()
    mover, holds = _mover(old, chosen_folders, busy="Run 1 is training. Stop it before moving the data folder.")

    with pytest.raises(MoveRefused, match="Run 1 is training") as refused:
        mover.start(ChangeDataFolder(folder=str(new), move_data=True))

    assert refused.value.conflict
    assert (old / "runs" / RUN / "status.json").is_file()
    assert mover.status().state == "idle"
    assert holds.reasons[-1] is None
    assert data_folder() != new.resolve()


@pytest.mark.parametrize(
    ("folder", "problem"),
    [
        (lambda old, app: old, "already the data folder"),
        (lambda old, app: old / "projects", "inside the current data folder"),
        (lambda old, app: app / "data", "inside the app's own folder"),
        (lambda old, app: old.parent / "missing", "does not exist"),
    ],
)
def test_a_folder_that_cannot_hold_the_data_is_refused_with_the_reason(chosen_folders, tmp_path, folder, problem):
    old, app = tmp_path / "old", tmp_path / "app"
    (old / "projects").mkdir(parents=True)
    (app / "data").mkdir(parents=True)
    save_data_folder(old)
    mover, _ = _mover(old, chosen_folders, app_root=app)

    target = folder(old, app)
    assert problem in (mover.check(str(target)).problem or "")
    with pytest.raises(MoveRefused, match=problem):
        mover.start(ChangeDataFolder(folder=str(target), move_data=True))


def test_a_folder_set_by_the_environment_cannot_change_from_the_app(tmp_path):
    mover, _ = _mover(tmp_path / "old", tmp_path / "settings")
    (tmp_path / "new").mkdir()

    assert "set by ICARUS_PROJECTS_DIR" in (mover.check(str(tmp_path / "new")).problem or "")


def test_the_storage_endpoint_reports_folders_and_sizes_and_refuses_a_missing_folder(chosen_folders, tmp_path):
    old = tmp_path / "old"
    _run(old / "runs", RUN, b"12345")
    with TestClient(create_app(old / "projects", old / "runs", chosen_folders)) as client:
        info = client.get("/settings/storage").json()
        response = client.post("/settings/storage/move", json={"folder": str(tmp_path / "missing"), "move_data": True})

    assert info["runs_folder"] == str(old / "runs")
    assert info["runs_bytes"] >= 5
    assert info["move"]["state"] == "idle"
    assert response.status_code == 422
    assert response.json()["message"] == "This folder does not exist"


def test_no_run_starts_while_the_data_folder_moves(tmp_path):
    state = ProjectStore(tmp_path / "projects").create("Parking", "parking_car")
    supervisor = Supervisor(RunStore(tmp_path / "runs"))
    supervisor.hold("Icarus is moving its data folder.")

    with pytest.raises(NotTrainable, match="moving its data folder"):
        supervisor.start(state, StartRun(total_steps=10_000, copies=1), threads=1, use_graphics_card=False)
    assert not (tmp_path / "runs").exists() or list((tmp_path / "runs").iterdir()) == []
