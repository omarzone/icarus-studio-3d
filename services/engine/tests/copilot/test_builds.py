import time

import pytest

from icarus.contracts.copilot import BuildIdea, BuildStatus, IdeaSet
from icarus.contracts.operations import SetProperty
from icarus.contracts.properties import NumberValue
from icarus.copilot.architect import IdeaBook, PlannedIdea, UnknownIdeas, propose_ideas
from icarus.copilot.builds import BUILD_STEPS, BuildBoard
from icarus.copilot.client import copilot_client
from icarus.copilot.settings import ModelSettingsStore
from icarus.projects.store import ProjectStore


def finished(board: BuildBoard, build_id: str) -> BuildStatus:
    for _ in range(400):
        status = board.status(build_id)
        if status.ready or status.error:
            return status
        time.sleep(0.05)
    raise AssertionError("The build did not finish")


@pytest.fixture
def ideas(tmp_path) -> tuple[IdeaBook, IdeaSet]:
    book = IdeaBook()
    idea_set, drafts = propose_ideas(copilot_client(ModelSettingsStore(tmp_path)), "a little car that learns to park")
    book.add(idea_set, drafts)
    return book, idea_set


def test_a_build_creates_a_project_whose_head_is_a_tested_copilot_revision(tmp_path, ideas):
    book, idea_set = ideas
    store = ProjectStore(tmp_path / "projects")
    idea = idea_set.ideas[0]
    board = BuildBoard(store, book)
    started = board.start(BuildIdea(idea_set=idea_set.id, idea=idea.id))
    assert [step.label for step in started.steps] == [label for _, label in BUILD_STEPS]
    status = finished(board, started.build_id)
    assert status.error is None and status.ready and status.progress == 1
    assert all(step.status == "done" for step in status.steps)
    assert status.project_id is not None
    state = store.state(status.project_id)
    assert state.revision.author == "copilot" and state.revision.number == 2
    assert state.report.ok and state.project.name == idea.title
    assert {obj.id for obj in state.project.world.objects} >= {"bay_wall_left", "bay_wall_right", "bay_wall_back"}


def test_an_unknown_idea_is_refused_before_anything_is_built(tmp_path, ideas):
    board = BuildBoard(ProjectStore(tmp_path / "projects"), ideas[0])
    with pytest.raises(UnknownIdeas):
        board.start(BuildIdea(idea_set="nope", idea="nope"))
    assert not (tmp_path / "projects").exists()


def test_a_build_that_fails_after_creating_its_project_leaves_no_project_behind(tmp_path, ideas):
    book, idea_set = ideas
    idea = idea_set.ideas[0]
    _, drafts = book.get(idea_set.id)
    heavy = SetProperty(
        op="set_property",
        object="car",
        component="physics_body",
        property="mass",
        value=NumberValue(type="number", value=50000),
    )
    book.add(idea_set, {idea.id: PlannedIdea(drafts[idea.id].draft.model_copy(update={"operations": [heavy]}))})
    store = ProjectStore(tmp_path / "projects")
    board = BuildBoard(store, book)
    status = finished(board, board.start(BuildIdea(idea_set=idea_set.id, idea=idea.id)).build_id)
    assert status.error and not status.ready and status.project_id is None
    assert store.list_projects() == []


def test_building_the_same_idea_twice_returns_the_first_build(tmp_path, ideas):
    book, idea_set = ideas
    store = ProjectStore(tmp_path / "projects")
    board = BuildBoard(store, book)
    request = BuildIdea(idea_set=idea_set.id, idea=idea_set.ideas[0].id)
    first = finished(board, board.start(request).build_id)
    again = board.start(request)
    assert again.build_id == first.build_id and again.project_id == first.project_id
    assert len(store.list_projects()) == 1


def test_a_from_scratch_idea_is_built_stage_by_stage_with_its_own_steps(tmp_path):
    book = IdeaBook()
    client = copilot_client(ModelSettingsStore(tmp_path))
    idea_set, drafts = propose_ideas(client, "a three-wheeled delivery robot in a warehouse")
    book.add(idea_set, drafts)
    idea = next(item for item in idea_set.ideas if item.template == "empty_world")
    store = ProjectStore(tmp_path / "projects")
    board = BuildBoard(store, book)
    started = board.start(BuildIdea(idea_set=idea_set.id, idea=idea.id))
    assert [step.label for step in started.steps] == [
        "Planning the design",
        "Building the world",
        "Building Delivery robot",
        "Setting the task",
        "Testing the physics",
    ]
    status = finished(board, started.build_id)
    assert status.error is None and status.ready and all(step.status == "done" for step in status.steps)
    assert status.project_id is not None
    revisions = store.revisions(status.project_id)
    assert [revision.summary for revision in revisions][1:] == [
        "Built the world of “Warehouse runner”",
        "Built Delivery robot",
        "Set the task",
    ]
    state = store.state(status.project_id)
    assert state.report.ok and state.project.name == idea.title and state.project.task.family == "navigation"
    assert [body.id for body in state.project.bodies] == ["delivery_bot"]
