import copy

import pytest
from fastapi.testclient import TestClient

from icarus.api.app import create_app

SOURCE = {"creation_id": "a1b2c3d4e5f60718293a4b5c6d7e8f90", "version": 3, "title": "Tight Parking"}


@pytest.fixture
def client(tmp_path) -> TestClient:
    return TestClient(create_app(tmp_path))


def published_bundle(client: TestClient) -> dict:
    """A real project, edited once, wrapped as the desktop's publish flow wraps it for the community."""
    project_id = client.post("/projects", json={"name": "Parking", "template": "parking_car"}).json()["project"]["id"]
    rename = {"op": "rename_project", "name": "Lot", "description": "Park between the cones"}
    state = client.post(f"/projects/{project_id}/operations", json={"summary": "Rename", "operations": [rename]}).json()
    return {
        "format": "icarus.bundle",
        "format_version": 1,
        "kind": "project",
        "contract_version": f"project-{state['project']['schema_version']}",
        "library_version": client.get("/library").json()["version"],
        "created_with": "Icarus Studio 3D",
        "lineage": {"remix_of": None},
        "project": state["project"],
    }


def test_a_published_project_comes_back_as_a_new_remixed_project(client):
    bundle = published_bundle(client)
    unpacked = client.post("/bundles/unpack", json={"bundle": bundle, "source": SOURCE, "name": "My Lot"})
    assert unpacked.status_code == 201
    state = unpacked.json()
    original = bundle["project"]
    assert state["project"]["id"] != original["id"]
    assert state["project"]["name"] == "My Lot"
    assert {**state["project"], "id": original["id"], "name": original["name"]} == original
    assert state["remix_of"] == SOURCE
    assert state["report"]["ok"] is True
    assert state["revision"]["number"] == 1
    assert state["revision"]["summary"] == "Remixed from Tight Parking"
    project_id = state["project"]["id"]
    assert client.get(f"/projects/{project_id}").json()["remix_of"] == SOURCE
    assert len(client.get("/projects").json()) == 2
    copied = client.post(f"/projects/{project_id}/duplicate", json={"name": "Lot copy"}).json()
    assert copied["remix_of"] == SOURCE


def test_a_project_of_your_own_has_no_remix_origin(client):
    created = client.post("/projects", json={"name": "Parking", "template": "parking_car"}).json()
    assert created["remix_of"] is None


def _first_car_component(bundle: dict) -> dict:
    car = next(obj for body in bundle["project"]["bodies"] for obj in body["objects"] if obj["id"] == "car")
    return car["components"][0]


def _script_name(bundle: dict) -> None:
    bundle["project"]["name"] = "<script>alert(1)</script>"


def _unknown_envelope_field(bundle: dict) -> None:
    bundle["run"] = "python train.py"


def _brain_kind(bundle: dict) -> None:
    bundle["kind"] = "brain"


def _old_contract(bundle: dict) -> None:
    bundle["contract_version"] = "project-0"


def _newer_library(bundle: dict) -> None:
    bundle["library_version"] = "999"


def _unknown_project_field(bundle: dict) -> None:
    bundle["project"]["hooks"] = ["on_load"]


def _embedded_program(bundle: dict) -> None:
    bundle["project"]["description"] = "data:application/x-sh;base64,ZWNobyBoaQ=="


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (_script_name, "looks like code"),
        (_unknown_envelope_field, "fields Icarus does not know: run"),
        (_brain_kind, "Only whole projects"),
        (_old_contract, "project version"),
        (_newer_library, "library 999"),
        (_unknown_project_field, "not valid"),
        (_embedded_program, "looks like code"),
    ],
)
def test_bundles_that_are_not_readable_project_data_are_refused(client, change, message):
    bundle = published_bundle(client)
    change(bundle)
    refused = client.post("/bundles/unpack", json={"bundle": bundle, "source": SOURCE})
    assert refused.status_code == 422
    assert message in refused.json()["message"]
    assert len(client.get("/projects").json()) == 1


def test_a_part_the_library_does_not_have_is_refused_with_where_it_is(client):
    bundle = published_bundle(client)
    _first_car_component(bundle)["kind"] = "rocket_engine"
    refused = client.post("/bundles/unpack", json={"bundle": copy.deepcopy(bundle), "source": SOURCE})
    assert refused.status_code == 422
    assert any("not a library component" in issue["message"] for issue in refused.json()["issues"])
    assert len(client.get("/projects").json()) == 1
