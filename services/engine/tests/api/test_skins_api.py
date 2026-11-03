import base64
import json

import pytest
from fastapi.testclient import TestClient

from icarus.api.app import create_app
from icarus.contracts.project import Project
from icarus.library.look_properties import training_content
from tests.model_files import glb, gltf_document


def encoded(data: bytes) -> str:
    return base64.b64encode(data).decode()


@pytest.fixture
def client(tmp_path) -> TestClient:
    return TestClient(create_app(tmp_path))


@pytest.fixture
def project_id(client) -> str:
    return client.post("/projects", json={"name": "Parking", "template": "parking_car"}).json()["project"]["id"]


def _object(client: TestClient, project_id: str, object_id: str) -> dict:
    project = client.get(f"/projects/{project_id}").json()["project"]
    return next(obj for obj in project["world"]["objects"] if obj["id"] == object_id)


def _properties(obj: dict, kind: str) -> dict:
    component = next(item for item in obj["components"] if item["kind"] == kind)
    return {name: value.get("value") for name, value in component["properties"].items()}


def test_importing_a_model_adds_a_collider_fitted_to_it_that_wears_it(client, project_id):
    body = {"name": "delivery_van.glb", "data": encoded(glb()), "length": 4, "density": 200, "position": [3, 0, 0]}
    imported = client.post(f"/projects/{project_id}/skins", json=body)
    assert imported.status_code == 201
    result = imported.json()
    assert result["skin"]["bounds"] == [2.0, 0.5, 1.0]
    obj = _object(client, project_id, result["object"])
    assert obj["name"] == "Delivery van"
    # Scaled so its longest side is 4 m: 4 × 1 × 2, resting on the ground. At x = 3 it would cover the car at the
    # start, so it lands on the first clear spot of the ring one van length plus a metre further along X.
    assert _properties(obj, "mesh") == {"shape": "box", "size": [4.0, 1.0, 2.0]}
    assert _properties(obj, "transform")["position"] == [8.0, 0.0, 1.0]
    assert _properties(obj, "physics_body")["mass"] == pytest.approx(200 * 4 * 1 * 2)
    assert _properties(obj, "skin")["asset"] == result["skin"]["id"]
    geom = next(
        item for item in client.get(f"/projects/{project_id}/scene").json()["geoms"] if item["name"] == obj["id"]
    )
    assert geom["skin"]["asset"] == result["skin"]["id"] and geom["skin"]["project"] == project_id
    served = client.get(f"/projects/{project_id}/skins/{result['skin']['id']}")
    assert served.content == glb() and served.headers["content-type"] == "model/gltf-binary"


def test_a_capsule_import_stands_upright_around_the_model(client, project_id):
    body = {"name": "fox.glb", "data": encoded(glb()), "collider": "capsule", "mode": "static"}
    obj = _object(client, project_id, client.post(f"/projects/{project_id}/skins", json=body).json()["object"])
    assert _properties(obj, "mesh") == {"shape": "capsule", "size": [2.0, 2.0, 2.0]}
    assert _properties(obj, "physics_body")["mode"] == "static"


@pytest.mark.parametrize(
    "data",
    [encoded(json.dumps(gltf_document(buffer_uri="https://example.com/van.bin")).encode()), "not base64!"],
)
def test_a_model_that_cannot_be_a_skin_changes_nothing(client, project_id, data):
    before = client.get(f"/projects/{project_id}").json()["revision"]["number"]
    rejected = client.post(f"/projects/{project_id}/skins", json={"name": "van.gltf", "data": data})
    assert rejected.status_code == 422
    assert client.get(f"/projects/{project_id}").json()["revision"]["number"] == before


def test_changing_only_a_skin_keeps_what_a_trained_brain_depends_on(client, project_id):
    result = client.post(f"/projects/{project_id}/skins", json={"name": "van.glb", "data": encoded(glb())}).json()
    before = Project.model_validate(client.get(f"/projects/{project_id}").json()["project"])
    edits = [
        {
            "op": "set_property",
            "object": result["object"],
            "component": "skin",
            "property": "fill",
            "value": {"type": "slider", "value": 0.5},
        },
        {"op": "remove_component", "object": result["object"], "component": "skin"},
    ]
    applied = client.post(f"/projects/{project_id}/operations", json={"operations": edits, "summary": "Look"})
    assert applied.status_code == 200
    after = Project.model_validate(applied.json()["project"])
    assert training_content(after) == training_content(before)


def test_a_skin_must_name_a_stored_model(client, project_id):
    result = client.post(f"/projects/{project_id}/skins", json={"name": "van.glb", "data": encoded(glb())}).json()
    edit = {
        "op": "set_property",
        "object": result["object"],
        "component": "skin",
        "property": "asset",
        "value": {"type": "asset", "value": "../../secrets.glb"},
    }
    rejected = client.post(f"/projects/{project_id}/operations", json={"operations": [edit], "summary": "Bad"})
    assert rejected.status_code == 422
    assert client.get(f"/projects/{project_id}/skins/sk0000000000000000").status_code == 404


def test_a_model_attached_in_the_chat_is_kept_as_a_skin(client, project_id):
    upload = {"name": "van.glb", "media_type": "model/gltf-binary", "kind": "model", "data": encoded(glb())}
    assert client.post(f"/projects/{project_id}/attachments", json=upload).status_code == 201
    stored = client.post(f"/projects/{project_id}/skins", json={"name": "van.glb", "data": encoded(glb())}).json()
    assert client.get(f"/projects/{project_id}/skins/{stored['skin']['id']}").status_code == 200
    broken = upload | {"data": encoded(b"not a model")}
    assert client.post(f"/projects/{project_id}/attachments", json=broken).status_code == 422


def test_a_duplicated_project_keeps_its_skins(client, project_id):
    skin = client.post(f"/projects/{project_id}/skins", json={"name": "van.glb", "data": encoded(glb())}).json()
    copy = client.post(f"/projects/{project_id}/duplicate", json={"name": "Copy"}).json()["project"]["id"]
    assert client.get(f"/projects/{copy}/skins/{skin['skin']['id']}").content == glb()
