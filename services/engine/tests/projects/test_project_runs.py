import pytest

from icarus.contracts.training import RunState, RunStatus, StartRun
from icarus.projects.project_runs import delete_runs, duplicate_runs
from icarus.training.run_store import RunFolder, RunStore
from icarus.training.supervisor import RunInProgress
from tests.training.conftest import state_of

SOURCE = "0123456789ab"
TARGET = "ba9876543210"
SOURCE_HEAD = state_of("parking_car", SOURCE, 2)
TARGET_HEAD = state_of("parking_car", TARGET, 1)


@pytest.fixture
def runs(tmp_path) -> RunStore:
    return RunStore(tmp_path / "runs")


def ended_run(runs: RunStore, revision: int = 2, state: RunState = "done", best_step: int | None = 10_000) -> RunFolder:
    status = runs.create(state_of("parking_car", SOURCE, revision), StartRun(total_steps=10_000, copies=1), threads=1)
    folder = runs.folder(status.run_id)
    folder.write_status(status.model_copy(update={"state": state, "best_step": best_step, "step": 10_000}))
    folder.checkpoint_path(10_000).write_bytes(b"brain")
    (folder.path / "metrics.jsonl").write_text("", encoding="utf-8")
    (folder.path / "diagnosis").mkdir()
    (folder.path / "diagnosis" / "1.json").write_text("{}", encoding="utf-8")
    return folder


def copied(runs: RunStore) -> list[RunStatus]:
    return runs.list_runs(TARGET)


def test_runs_and_brains_copy_the_current_design_runs_under_the_new_project(runs):
    source = ended_run(runs)
    ended_run(runs, revision=1)

    result = duplicate_runs(runs, SOURCE_HEAD, TARGET_HEAD, True, True)

    assert len(result) == 1
    assert [status.run_id for status in result] == [status.run_id for status in copied(runs)]
    copy = runs.folder(result[0].run_id)
    assert copy.run_id != source.run_id
    assert copy.config().project_id == TARGET and copy.config().revision_number == 1
    assert copy.project().id == TARGET
    assert result[0].revision_number == 1 and result[0].name == source.status().name
    assert copy.checkpoint_path(10_000).read_bytes() == b"brain"
    assert not (copy.path / "diagnosis").exists()
    assert runs.trained_checkpoint(TARGET, 1) is not None
    assert len(runs.list_runs(SOURCE)) == 2


def test_runs_without_brains_keep_the_history_but_no_checkpoint(runs):
    ended_run(runs)

    result = duplicate_runs(runs, SOURCE_HEAD, TARGET_HEAD, False, True)

    copy = runs.folder(result[0].run_id)
    assert (copy.path / "metrics.jsonl").is_file()
    assert not copy.checkpoint_path(10_000).exists()
    assert runs.trained_checkpoint(TARGET, 1) is None


def test_brains_without_runs_copy_only_runs_that_hold_a_trained_brain(runs):
    ended_run(runs)
    ended_run(runs, best_step=None)

    result = duplicate_runs(runs, SOURCE_HEAD, TARGET_HEAD, True, False)

    assert len(result) == 1
    copy = runs.folder(result[0].run_id)
    assert copy.checkpoint_path(10_000).read_bytes() == b"brain"
    assert not (copy.path / "metrics.jsonl").exists()


def test_a_training_run_or_no_switch_copies_nothing(runs):
    ended_run(runs, state="running")
    assert duplicate_runs(runs, SOURCE_HEAD, TARGET_HEAD, True, True) == []

    ended_run(runs)
    assert duplicate_runs(runs, SOURCE_HEAD, TARGET_HEAD, False, False) == []
    assert copied(runs) == []


def test_delete_removes_every_run_of_the_project_only(runs):
    ended_run(runs)
    ended_run(runs, revision=1)
    duplicate_runs(runs, SOURCE_HEAD, TARGET_HEAD, True, True)

    removed = delete_runs(runs, SOURCE)

    assert len(removed) == 2
    assert runs.list_runs(SOURCE) == []
    assert len(copied(runs)) == 1


def test_delete_is_refused_while_a_run_trains_and_nothing_is_removed(runs):
    ended_run(runs)
    training = ended_run(runs, state="running")

    with pytest.raises(RunInProgress) as refused:
        delete_runs(runs, SOURCE)

    assert refused.value.run_id == training.run_id
    assert len(runs.list_runs(SOURCE)) == 2
