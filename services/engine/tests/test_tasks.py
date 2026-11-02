import threading

import pytest

from icarus.contracts.events import EngineEvent
from icarus.tasks import TaskContext, TaskRegistry, UnknownTask

WAIT = 5.0


class Recorder:
    def __init__(self) -> None:
        self.events: list[tuple[EngineEvent, str | None]] = []
        self._lock = threading.Lock()

    def __call__(self, event: EngineEvent, project_id: str | None) -> None:
        with self._lock:
            self.events.append((event, project_id))

    def types(self) -> list[str]:
        return [event.type for event, _ in self.events]


def test_a_task_runs_reports_progress_and_finishes_done_with_events_in_order():
    recorder = Recorder()
    registry = TaskRegistry(recorder)

    def work(task: TaskContext) -> None:
        task.progress(0.5, "Halfway through")
        task.progress(1.0, "All steps done")

    started = registry.start("diagnosis", "Diagnosing run abc", work, project_id="p1")
    finished = registry.wait(started.id, WAIT)

    assert started.state == "running"
    assert finished.state == "done"
    assert finished.progress == 1.0
    assert finished.finished_at is not None
    assert recorder.types() == ["task_started", "task_progress", "task_progress", "task_finished"]
    assert all(project_id == "p1" for _, project_id in recorder.events)
    first, last = recorder.events[0][0], recorder.events[-1][0]
    assert first.type == "task_started" and first.task.title == "Diagnosing run abc"
    assert last.type == "task_finished" and last.state == "done" and last.reason is None


def test_cancelling_stops_a_cooperative_task_with_a_final_stopped_event():
    recorder = Recorder()
    registry = TaskRegistry(recorder)
    entered = threading.Event()

    def work(task: TaskContext) -> None:
        entered.set()
        while True:
            task.token.check()
            task.token.wait(0.01)

    started = registry.start("autopilot", "Autopilot", work)
    assert entered.wait(WAIT)
    registry.cancel(started.id)
    finished = registry.wait(started.id, WAIT)

    assert finished.state == "stopped"
    last = recorder.events[-1][0]
    assert last.type == "task_finished" and last.state == "stopped"


def test_a_task_that_returns_after_noticing_the_cancel_is_stopped_not_done():
    registry = TaskRegistry()
    entered = threading.Event()

    def work(task: TaskContext) -> None:
        entered.set()
        task.token.wait(WAIT)

    started = registry.start("ideas", "Ideas", work)
    assert entered.wait(WAIT)
    registry.cancel(started.id)

    assert registry.wait(started.id, WAIT).state == "stopped"


def test_an_error_inside_the_task_ends_it_failed_with_the_reason():
    recorder = Recorder()
    registry = TaskRegistry(recorder)

    def work(task: TaskContext) -> None:
        raise RuntimeError("the run folder is missing")

    finished = registry.wait(registry.start("build", "Build", work).id, WAIT)

    assert finished.state == "failed"
    last = recorder.events[-1][0]
    assert last.type == "task_finished" and last.state == "failed"
    assert last.reason is not None and "the run folder is missing" in last.reason


def test_tasks_are_listed_by_project_and_cancelling_a_parent_stops_its_children():
    registry = TaskRegistry()
    release = threading.Event()

    def wait_for_cancel(task: TaskContext) -> None:
        task.token.wait(WAIT)

    parent = registry.start("agent_turn", "Chat turn", wait_for_cancel, project_id="p1")
    child = registry.start("diagnosis", "Diagnosis", wait_for_cancel, project_id="p1", parent_task_id=parent.id)
    other = registry.start("ideas", "Ideas", lambda task: release.wait(WAIT), project_id="p2")

    assert {task.id for task in registry.list("p1")} == {parent.id, child.id}
    assert [task.id for task in registry.list("p2")] == [other.id]
    assert registry.get(child.id).parent_task_id == parent.id

    registry.cancel(parent.id)
    assert registry.wait(child.id, WAIT).state == "stopped"
    assert registry.wait(parent.id, WAIT).state == "stopped"
    release.set()
    assert registry.wait(other.id, WAIT).state == "done"


def test_unknown_tasks_are_reported_and_progress_after_the_end_is_ignored():
    recorder = Recorder()
    registry = TaskRegistry(recorder)
    kept: list[TaskContext] = []

    finished = registry.wait(registry.start("build", "Build", kept.append).id, WAIT)
    kept[0].progress(0.3, "Too late")

    assert registry.get(finished.id).state == "done"
    assert recorder.types()[-1] == "task_finished"
    with pytest.raises(UnknownTask):
        registry.cancel("missing")


def test_a_restart_marks_unfinished_tasks_stopped_and_keeps_finished_ones(tmp_path):
    store = tmp_path / "tasks.json"
    first = TaskRegistry(store_path=store)
    entered = threading.Event()
    finished = first.wait(first.start("build", "Finished build", lambda task: None, project_id="p1").id, WAIT)

    def hang(task: TaskContext) -> None:
        entered.set()
        task.token.wait(WAIT)

    running = first.start("autopilot", "Autopilot", hang, project_id="p1")
    assert entered.wait(WAIT)

    recorder = Recorder()
    second = TaskRegistry(recorder, store_path=store)
    first.cancel(running.id)

    states = {task.id: task.state for task in second.list("p1")}
    assert states == {finished.id: "done", running.id: "stopped"}
    restarted = recorder.events[-1][0]
    assert restarted.type == "task_finished" and restarted.task_id == running.id and restarted.state == "stopped"


def test_a_publisher_that_breaks_does_not_break_the_task():
    def broken(event: EngineEvent, project_id: str | None) -> None:
        raise OSError("the event log is full")

    registry = TaskRegistry(broken)

    assert registry.wait(registry.start("build", "Build", lambda task: None).id, WAIT).state == "done"


def test_a_store_that_cannot_be_written_never_blocks_starting_or_finishing_a_task(tmp_path):
    store = tmp_path / "tasks.json"
    store.with_suffix(".tmp").mkdir()
    recorder = Recorder()
    registry = TaskRegistry(recorder, store_path=store)

    finished = registry.wait(registry.start("build", "Build", lambda task: None).id, WAIT)

    assert finished.state == "done"
    assert recorder.types()[-1] == "task_finished"


def test_finished_tasks_are_capped_even_without_a_store():
    registry = TaskRegistry(kept_finished=2)

    for index in range(4):
        registry.wait(registry.start("build", f"Build {index}", lambda task: None).id, WAIT)

    assert [task.title for task in registry.list()] == ["Build 2", "Build 3"]
