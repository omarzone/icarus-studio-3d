from fastapi.testclient import TestClient

from icarus.api.app import create_app
from tests.robot_files import leg_files


def test_importing_a_robot_makes_it_the_body_shown_in_the_scene(tmp_path):
    client = TestClient(create_app(tmp_path))
    project_id = client.post("/projects", json={"name": "Robot", "template": "empty_world"}).json()["project"]["id"]
    files = [file.model_dump() for file in leg_files()]
    imported = client.post(f"/projects/{project_id}/robots", json={"files": files})
    assert imported.status_code == 201
    result = imported.json()
    assert result["format"] == "urdf" and result["motors"] == 2
    state = client.get(f"/projects/{project_id}").json()
    assert [body["id"] for body in state["project"]["bodies"]] == [result["body"]]
    names = {geom["name"] for geom in client.get(f"/projects/{project_id}/scene").json()["geoms"]}
    assert {"base-link", "thigh", "shin"} <= names


def test_a_robot_without_its_mesh_is_refused_with_the_missing_file(tmp_path):
    client = TestClient(create_app(tmp_path))
    project_id = client.post("/projects", json={"name": "Robot", "template": "empty_world"}).json()["project"]["id"]
    refused = client.post(f"/projects/{project_id}/robots", json={"files": [leg_files()[0].model_dump()]})
    assert refused.status_code == 422
    assert "shin.stl" in refused.json()["message"]
