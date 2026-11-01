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


def vector(value: list[float]) -> dict:
    return {"type": "vector", "value": value}


def add_varied_crate(client: TestClient, project_id: str) -> None:
    static_mode = {"mode": {"type": "choice", "value": "static"}}
    crate = {
        "id": "crate",
        "name": "Crate",
        "parent": None,
        "components": [
            {"id": "transform", "kind": "transform", "properties": {"position": vector([6, 4, 0.5])}},
            {"id": "mesh", "kind": "mesh", "properties": {}},
            {"id": "material", "kind": "material", "properties": {"color": {"type": "color", "value": "#3366cc"}}},
            {"id": "physics_body", "kind": "physics_body", "properties": static_mode},
            {
                "id": "randomize",
                "kind": "randomize",
                "properties": {
                    "position_range": vector([2, 1, 0]),
                    "color": {"type": "switch", "value": True},
                },
            },
        ],
    }
    batch = {"summary": "Crate", "operations": [{"op": "create_object", "target": "world", "object": crate}]}
    assert client.post(f"/projects/{project_id}/operations", json=batch).status_code == 200


def geoms_by_name(scene: dict) -> dict[str, dict]:
    return {geom["name"]: geom for geom in scene["geoms"]}


def test_copies_preview_one_scene_per_training_copy_varying_only_what_randomize_says(client):
    project_id = client.post("/projects", json={"name": "Parking", "template": "parking_car"}).json()["project"]["id"]
    add_varied_crate(client, project_id)

    response = client.get(f"/projects/{project_id}/copies", params={"count": 3})
    assert response.status_code == 200
    copies = [geoms_by_name(scene) for scene in response.json()]
    assert len(copies) == 3
    assert len({tuple(copy["crate"]["position"]) for copy in copies}) == 3
    assert len({copy["crate"]["color"] for copy in copies}) == 3
    assert all(copy["ground"] == copies[0]["ground"] for copy in copies)
    assert all(scene["zones"] for scene in response.json())
    assert client.get(f"/projects/{project_id}/copies", params={"count": 3}).json() == response.json()


def test_copies_default_to_the_brain_copies_and_refuse_bad_counts_and_unknown_projects(client):
    project_id = client.post("/projects", json={"name": "Parking", "template": "parking_car"}).json()["project"]["id"]
    assert len(client.get(f"/projects/{project_id}/copies").json()) == 16
    assert client.get(f"/projects/{project_id}/copies", params={"count": 0}).status_code == 422
    assert client.get(f"/projects/{project_id}/copies", params={"count": 65}).status_code == 422
    assert client.get("/projects/ffffffffffff/copies").status_code == 404
