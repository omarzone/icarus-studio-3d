import time

import pytest
from fastapi.testclient import TestClient

from icarus.api.app import create_app

PARKING_PROMPT = "a little car that learns to park itself"


@pytest.fixture
def client(tmp_path) -> TestClient:
    return TestClient(create_app(tmp_path / "projects", tmp_path / "runs", tmp_path / "settings"))


@pytest.fixture
def project_id(client) -> str:
    return client.post("/projects", json={"name": "Parking", "template": "parking_car"}).json()["project"]["id"]


def built_project(client: TestClient) -> str:
    ideas = client.post("/ideas", json={"prompt": PARKING_PROMPT})
    assert ideas.status_code == 200
    idea_set = ideas.json()
    assert len(idea_set["ideas"]) == 3 and client.get(f"/ideas/{idea_set['id']}").json() == idea_set
    started = client.post("/builds", json={"idea_set": idea_set["id"], "idea": idea_set["ideas"][0]["id"]})
    assert started.status_code == 202
    build_id = started.json()["build_id"]
    status = client.get(f"/builds/{build_id}").json()
    for _ in range(400):
        if status["ready"] or status["error"]:
            break
        time.sleep(0.05)
        status = client.get(f"/builds/{build_id}").json()
    assert status["ready"] and status["error"] is None
    return status["project_id"]


def test_ideas_build_a_project_and_make_it_night_is_applied(client):
    project_id = built_project(client)
    assert client.get(f"/projects/{project_id}").json()["revision"]["author"] == "copilot"
    sent = client.post(f"/projects/{project_id}/conversation/messages", json={"text": "make it night"})
    assert sent.status_code == 200
    proposal = sent.json()["proposals"][0]
    scene = client.get(f"/proposals/{proposal['id']}/scene")
    assert scene.status_code == 200 and any(geom["color"] == "#22252b" for geom in scene.json()["geoms"])
    applied = client.post(f"/proposals/{proposal['id']}/apply")
    assert applied.status_code == 200 and applied.json()["proposals"][0]["applied_revision"] == 3
    history = client.get(f"/projects/{project_id}/revisions").json()
    assert [revision["author"] for revision in history] == ["user", "copilot", "copilot"]
    again = client.post(f"/proposals/{proposal['id']}/apply")
    assert again.status_code == 409 and again.json()["code"] == "conflict"


def test_an_outdated_proposal_is_refused_with_409(client, project_id):
    proposal = client.post(f"/projects/{project_id}/conversation/messages", json={"text": "make it night"})
    proposal_id = proposal.json()["proposals"][0]["id"]
    client.post(
        f"/projects/{project_id}/operations",
        json={
            "summary": "Rename",
            "operations": [{"op": "rename_project", "name": "Renamed"}],
        },
    )
    refused = client.post(f"/proposals/{proposal_id}/apply")
    assert refused.status_code == 409 and refused.json()["code"] == "outdated"
    assert client.get(f"/projects/{project_id}/conversation").json()["proposals"][0]["status"] == "outdated"


def test_discard_and_autonomy(client, project_id):
    sent = client.post(f"/projects/{project_id}/conversation/messages", json={"text": "make it night"}).json()
    discarded = client.post(f"/proposals/{sent['proposals'][0]['id']}/discard")
    assert discarded.status_code == 200 and discarded.json()["proposals"][0]["status"] == "discarded"
    autonomy = client.post(f"/projects/{project_id}/conversation/autonomy", json={"autonomy": "autopilot"})
    assert autonomy.json()["autonomy"] == "autopilot"
    auto = client.post(f"/projects/{project_id}/conversation/messages", json={"text": "make it dark"}).json()
    assert auto["proposals"][-1]["status"] == "applied"


def test_unknown_things_are_404(client, project_id):
    assert client.get("/projects/000000000000/conversation").json()["code"] == "not_found"
    assert client.post(f"/proposals/{project_id}-00000000/apply").status_code == 404
    assert client.get("/ideas/nope").status_code == 404
    assert client.get("/builds/nope").status_code == 404
    assert client.post("/builds", json={"idea_set": "nope", "idea": "nope"}).status_code == 404


def test_without_a_connection_every_copilot_route_answers_503(client, project_id, monkeypatch):
    monkeypatch.setenv("ICARUS_COPILOT_PROVIDER", "")
    for response in (
        client.post("/ideas", json={"prompt": PARKING_PROMPT}),
        client.post(f"/projects/{project_id}/conversation/messages", json={"text": "make it night"}),
    ):
        assert response.status_code == 503
        assert response.json() == {
            "code": "not_connected",
            "message": "Connect a model in Settings › AI models to use the copilot.",
            "details": None,
        }


def test_no_valid_idea_is_a_readable_copilot_error(client):
    response = client.post("/ideas", json={"prompt": "something impossible"})
    assert response.status_code == 502 and response.json()["code"] == "copilot_error"


def test_model_settings_keep_the_key_inside_the_engine(client, monkeypatch):
    monkeypatch.setenv("ICARUS_COPILOT_PROVIDER", "")
    key = "sk-test-key-0000001234"
    saved = client.put(
        "/settings/models",
        json={
            "endpoint": "https://models.example/v1",
            "api_key": key,
            "models": {"reasoning": "big-model"},
        },
    )
    assert saved.status_code == 200 and key not in saved.text and saved.json()["api_key_hint"] == "1234"
    assert key not in client.get("/settings/models").text
    rejected = client.put("/settings/models", json={"models": {"telepathy": "x"}})
    assert rejected.status_code == 422


def test_a_connection_test_connects_a_capability_that_answers(client):
    client.put("/settings/models", json={"endpoint": "https://models.example/v1", "models": {"vision": "eyes"}})
    tested = client.post("/settings/models/test").json()
    vision = next(item for item in tested["connections"] if item["capability"] == "vision")
    assert vision["connected"] and vision["model"] == "eyes"
