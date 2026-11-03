import base64
import time

import pytest
from fastapi.testclient import TestClient

from icarus.api.app import create_app
from tests.model_files import humanoid_obj


def encoded(data: bytes) -> str:
    return base64.b64encode(data).decode()


@pytest.fixture
def client(tmp_path) -> TestClient:
    return TestClient(create_app(tmp_path))


def _project(client: TestClient, template: str) -> str:
    return client.post("/projects", json={"name": "Body", "template": template}).json()["project"]["id"]


def _finished(client: TestClient, project_id: str) -> dict:
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        status = client.get(f"/projects/{project_id}/auto-rig").json()
        if status["state"] != "running":
            return status
        time.sleep(0.05)
    raise AssertionError("the auto-rig did not finish")


def test_an_obj_is_auto_rigged_into_the_projects_body_in_the_background(client):
    project_id = _project(client, "empty_world")
    assert client.get(f"/projects/{project_id}/auto-rig").status_code == 404
    started = client.post(
        f"/projects/{project_id}/auto-rig", json={"name": "person.obj", "data": encoded(humanoid_obj())}
    )
    assert started.status_code == 202 and started.json()["file"] == "person.obj"
    status = _finished(client, project_id)
    assert status["state"] == "done" and status["percent"] == 100, status
    assert status["steps"][0]["text"].startswith("Read person.obj")
    project = client.get(f"/projects/{project_id}").json()["project"]
    assert project["bodies"][0]["id"] == status["body"]
    weights = client.get(f"/projects/{project_id}/skin-weights").json()
    assert len(weights["bones"]) >= 10
    rebound = client.post(f"/projects/{project_id}/skin-weights/rebind").json()
    assert [bone["part"] for bone in rebound["bones"]]


def test_a_file_that_is_no_model_fails_the_auto_rig_with_its_reason(client):
    project_id = _project(client, "empty_world")
    client.post(f"/projects/{project_id}/auto-rig", json={"name": "notes.txt", "data": encoded(b"hello")})
    status = _finished(client, project_id)
    assert status["state"] == "failed" and "obj" in status["message"].lower()


def test_the_rig_check_poses_and_fixes_answer_for_a_body(client):
    project_id = _project(client, "humanoid")
    check = client.get(f"/projects/{project_id}/rig-check").json()
    assert check["report"]["ok"] and check["findings"] == []
    assert client.post(f"/projects/{project_id}/rig-check/fix").json()["revision"] is None
    posed = client.post(f"/projects/{project_id}/poses", json={"pose": "high"}).json()
    assert posed["label"] == "Toward the upper limits" and posed["scene"]["geoms"]
    assert client.post(f"/projects/{project_id}/poses", json={"pose": "cartwheel"}).status_code == 422


def test_an_obj_imports_as_a_static_look_through_the_skin_route(client):
    project_id = _project(client, "empty_world")
    body = {"name": "rock.obj", "data": encoded(humanoid_obj()), "mode": "static"}
    imported = client.post(f"/projects/{project_id}/skins", json=body)
    assert imported.status_code == 201, imported.text
    assert imported.json()["skin"]["format"] == "glb"
