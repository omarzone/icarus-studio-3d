import pytest
from fastapi.testclient import TestClient

from icarus.api.app import create_app


@pytest.fixture
def client(tmp_path) -> TestClient:
    return TestClient(create_app(tmp_path))


def mass_batch(value: float) -> dict:
    return {
        "summary": f"Mass {value}",
        "operations": [
            {
                "op": "set_property",
                "object": "car",
                "component": "physics_body",
                "property": "mass",
                "value": {"type": "number", "value": value},
            }
        ],
    }


def car_mass(state: dict) -> float:
    car = next(obj for body in state["project"]["bodies"] for obj in body["objects"] if obj["id"] == "car")
    return next(c for c in car["components"] if c["kind"] == "physics_body")["properties"]["mass"]["value"]


def test_create_edit_reject_undo(client):
    created = client.post("/projects", json={"name": "Parking", "template": "parking_car"})
    assert created.status_code == 201
    project_id = created.json()["project"]["id"]

    edited = client.post(f"/projects/{project_id}/operations", json=mass_batch(1200))
    assert edited.status_code == 200
    assert edited.json()["revision"]["number"] == 2

    rejected = client.post(f"/projects/{project_id}/operations", json=mass_batch(-1))
    assert rejected.status_code == 422
    assert rejected.json()["issues"][0]["path"].endswith("physics_body.mass")

    undone = client.post(f"/projects/{project_id}/undo")
    assert undone.status_code == 200
    assert undone.json()["revision"]["number"] == 1
    assert car_mass(undone.json()) == 900

    scene = client.get(f"/projects/{project_id}/scene")
    assert scene.status_code == 200
    assert len(scene.json()["geoms"]) >= 5


def test_history_and_listing(client):
    project_id = client.post("/projects", json={"name": "Walk", "template": "walker_robot"}).json()["project"]["id"]
    assert [item["id"] for item in client.get("/projects").json()] == [project_id]
    assert [item["number"] for item in client.get(f"/projects/{project_id}/revisions").json()] == [1]
    assert client.get(f"/projects/{project_id}").json()["revision"]["number"] == 1
    assert client.delete(f"/projects/{project_id}").status_code == 204
    assert client.get("/projects").json() == []


def test_unknown_project_is_404(client):
    response = client.get("/projects/0123456789ab")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


def test_undo_at_the_first_revision_is_409(client):
    project_id = client.post("/projects", json={"name": "E", "template": "empty_world"}).json()["project"]["id"]
    response = client.post(f"/projects/{project_id}/undo")
    assert response.status_code == 409
    assert response.json()["code"] == "conflict"


def test_unknown_template_is_422(client):
    response = client.post("/projects", json={"name": "X", "template": "nope"})
    assert response.status_code == 422


def test_rename_duplicate_and_restore_over_http(client):
    project_id = client.post("/projects", json={"name": "Parking", "template": "parking_car"}).json()["project"]["id"]
    renamed = client.post(
        f"/projects/{project_id}/operations",
        json={
            "summary": "Rename",
            "operations": [{"op": "rename_project", "name": "Lot", "description": "Park between the cones"}],
        },
    ).json()
    assert (renamed["project"]["name"], renamed["project"]["description"]) == ("Lot", "Park between the cones")
    copy = client.post(f"/projects/{project_id}/duplicate", json={"name": "Lot copy"})
    assert copy.status_code == 201
    assert copy.json()["project"]["name"] == "Lot copy"
    restored = client.post(f"/projects/{project_id}/revisions/1/restore")
    assert restored.json()["revision"]["restored_from"] == 1
    assert restored.json()["project"]["name"] == "Parking"
    assert client.post(f"/projects/{project_id}/revisions/9/restore").status_code == 404


def test_library_lists_pieces(client):
    assert {"box", "ramp", "wall", "post", "ball"} <= {piece["id"] for piece in client.get("/library").json()["pieces"]}
