import pytest

from icarus.projects.notes import MAX_NOTES_LENGTH, NotesTooLong, ProjectNotes
from icarus.projects.store import UnknownProject

PROJECT = "0123456789ab"


@pytest.fixture
def notes(tmp_path) -> ProjectNotes:
    return ProjectNotes(tmp_path)


def test_notes_are_empty_until_written_and_read_back_after(notes, tmp_path):
    assert notes.read(PROJECT) == ""

    notes.write(PROJECT, "Run 3 learned to brake.")

    assert notes.read(PROJECT) == "Run 3 learned to brake."
    assert (tmp_path / ".copilot" / "notes" / f"{PROJECT}.md").is_file()


def test_ids_that_could_leave_the_notes_folder_are_refused(notes):
    for project_id in ("../escape", "0123456789AB", "short", "0123456789ab/x"):
        with pytest.raises(UnknownProject):
            notes.write(project_id, "x")
        with pytest.raises(UnknownProject):
            notes.read(project_id)


def test_notes_past_the_size_cap_are_refused_and_the_old_text_kept(notes):
    notes.write(PROJECT, "kept")

    with pytest.raises(NotesTooLong):
        notes.write(PROJECT, "x" * (MAX_NOTES_LENGTH + 1))

    assert notes.read(PROJECT) == "kept"


def test_copilot_view_is_none_without_real_notes(notes):
    assert notes.for_copilot(PROJECT) is None
    notes.write(PROJECT, "  \n")
    assert notes.for_copilot(PROJECT) is None
    notes.write(PROJECT, "Try a longer run.\n")
    assert notes.for_copilot(PROJECT) == "Try a longer run."


def test_deleting_notes_removes_them_and_is_idempotent(notes):
    notes.write(PROJECT, "gone soon")
    notes.delete(PROJECT)
    notes.delete(PROJECT)
    assert notes.read(PROJECT) == ""
