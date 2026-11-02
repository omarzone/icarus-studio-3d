import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from icarus.api import notes, project_runs
from icarus.api.app import create_app
from icarus.contracts.training import StartRun


@pytest.fixture
def app(tmp_path) -> FastAPI:
    app = create_app(tmp_path / "projects", tmp_path / "runs", tmp_path / "settings")
    app.include_router(notes.router)
    app.include_router(project_runs.router)
    return app


@pytest.fixture
def client(app) -> TestClient:
    return TestClient(app)


def new_project(client: TestClient) -> str:
    return client.post("/projects", json={"name": "Parking", "template": "parking_car"}).json()["project"]["id"]


def test_notes_round_trip_and_reject_unknown_projects_and_huge_text(client):
    project_id = new_project(client)

    assert client.get(f"/projects/{project_id}/notes").json() == {"text": ""}
    assert client.put(f"/projects/{project_id}/notes", json={"text": "Brakes late."}).status_code == 200
    assert client.get(f"/projects/{project_id}/notes").json() == {"text": "Brakes late."}
    assert client.get("/projects/0000000000aa/notes").status_code == 404
    assert client.put(f"/projects/{project_id}/notes", json={"text": "x" * 50_001}).status_code == 422


def test_runs_copy_to_a_duplicate_and_delete_refuses_while_training(app, client):
    project_id = new_project(client)
    status = app.state.runs.create(app.state.store.state(project_id), StartRun(total_steps=10_000, copies=1), threads=1)
    folder = app.state.runs.folder(status.run_id)
    copy_id = client.post(f"/projects/{project_id}/duplicate", json={"name": "Copy"}).json()["project"]["id"]

    assert client.post(f"/projects/{project_id}/runs/copy-to/{copy_id}?brains=true&runs=true").json() == []
    refused = client.delete(f"/projects/{project_id}/runs")
    assert refused.status_code == 409 and refused.json()["code"] == "conflict"

    folder.write_status(status.model_copy(update={"state": "done"}))
    copies = client.post(f"/projects/{project_id}/runs/copy-to/{copy_id}?brains=true&runs=true").json()
    assert [run["project_id"] for run in copies] == [copy_id]
    assert client.delete(f"/projects/{project_id}/runs").json() == [status.run_id]
    assert client.get(f"/projects/{project_id}/runs").json() == []
    assert client.post(f"/projects/{project_id}/runs/copy-to/0000000000aa").status_code == 404
