import threading

from fastapi.testclient import TestClient

from icarus.project_activity import ProjectWorkers, close_project
from icarus.tasks import TaskContext
from tests.api.test_runs_api import START, make_app, new_project, wait_for


def _hanging_task(app, project_id: str) -> str:
    entered = threading.Event()

    def work(task: TaskContext) -> None:
        entered.set()
        task.token.wait(30)

    info = app.state.tasks.start("pose_tracking", "Track the motion in dance.mp4", work, project_id)
    assert entered.wait(5)
    return info.id


def test_closing_a_project_stops_its_training_and_tasks_and_leaves_other_projects_alone(tmp_path):
    app = make_app(tmp_path)
    client = TestClient(app)
    project_id = new_project(client)
    other_id = new_project(client)
    run_id = client.post(f"/projects/{project_id}/runs", json=START).json()["run_id"]
    wait_for(lambda: client.get(f"/runs/{run_id}").json()["state"] == "running")
    task_id = _hanging_task(app, project_id)
    other_task = _hanging_task(app, other_id)

    running = client.get(f"/projects/{project_id}/activity").json()["running"]
    assert [(item["kind"], item["id"], item["title"]) for item in running] == [
        ("training", run_id, "Run 1"),
        ("task", task_id, "Track the motion in dance.mp4"),
    ]

    closed = client.post(f"/projects/{project_id}/close").json()
    assert [item["id"] for item in closed["stopped"]] == [run_id, task_id]
    assert closed["still_running"] == []
    assert client.get(f"/runs/{run_id}").json()["state"] == "stopped"
    assert app.state.tasks.get(task_id).state == "stopped"
    assert client.get(f"/projects/{project_id}/activity").json()["running"] == []
    assert app.state.tasks.get(other_task).state == "running"
    app.state.tasks.cancel(other_task)


def test_a_run_that_does_not_stop_in_time_is_reported_as_still_running(tmp_path):
    app = make_app(tmp_path, mode="ignore")
    client = TestClient(app)
    project_id = new_project(client)
    run_id = client.post(f"/projects/{project_id}/runs", json=START).json()["run_id"]
    wait_for(lambda: client.get(f"/runs/{run_id}").json()["state"] == "running")
    workers = ProjectWorkers(app.state.runs, app.state.supervisor, app.state.autopilot, app.state.tasks)

    closed = close_project(workers, project_id, wait=0.3)

    assert ([item.id for item in closed.stopped], [item.id for item in closed.still_running]) == ([], [run_id])
    app.state.supervisor.shutdown(timeout=1)


def test_closing_an_idle_project_stops_nothing_and_an_unknown_one_is_not_found(tmp_path):
    client = TestClient(make_app(tmp_path))
    project_id = new_project(client)

    assert client.post(f"/projects/{project_id}/close").json() == {
        "project_id": project_id,
        "stopped": [],
        "still_running": [],
    }
    assert client.get("/projects/missing/activity").status_code == 404
