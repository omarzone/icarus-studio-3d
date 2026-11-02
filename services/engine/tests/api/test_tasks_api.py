import threading

from fastapi import FastAPI
from fastapi.testclient import TestClient

from icarus.api import tasks
from icarus.tasks import TaskContext, TaskRegistry


def _client(registry: TaskRegistry) -> TestClient:
    app = FastAPI()
    app.state.tasks = registry
    app.include_router(tasks.router)
    return TestClient(app)


def test_tasks_are_listed_for_a_project_and_cancelled_by_id():
    registry = TaskRegistry()
    entered = threading.Event()

    def work(task: TaskContext) -> None:
        entered.set()
        task.token.wait(5)

    running = registry.start("autopilot", "Autopilot", work, project_id="p1")
    registry.start("ideas", "Ideas elsewhere", lambda task: None, project_id="p2")
    assert entered.wait(5)
    client = _client(registry)

    listed = client.get("/tasks", params={"project": "p1"})
    assert listed.status_code == 200
    assert [task["id"] for task in listed.json()] == [running.id]

    cancelled = client.delete(f"/tasks/{running.id}")
    assert cancelled.status_code == 202
    assert registry.wait(running.id, 5).state == "stopped"


def test_cancelling_an_unknown_task_is_not_found():
    assert _client(TaskRegistry()).delete("/tasks/missing").status_code == 404
