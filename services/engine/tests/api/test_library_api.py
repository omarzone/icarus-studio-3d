from fastapi.testclient import TestClient

from icarus.api.app import create_app


def test_library_lists_the_motor_with_its_force_schema(tmp_path):
    catalog = TestClient(create_app(tmp_path)).get("/library").json()
    motor = next(kind for kind in catalog["components"] if kind["kind"] == "motor")
    force = next(prop for prop in motor["properties"] if prop["id"] == "max_force")
    assert (force["type"], force["unit"], force["max"]) == ("number", "N", 10000)


def test_template_scene_matches_a_new_project_from_it_and_stores_nothing(tmp_path):
    client = TestClient(create_app(tmp_path))
    preview = client.get("/library/templates/walker_robot/scene")
    assert preview.status_code == 200
    assert list(tmp_path.glob("*/head.json")) == []

    project_id = client.post("/projects", json={"name": "Walk", "template": "walker_robot"}).json()["project"]["id"]
    assert preview.json() == client.get(f"/projects/{project_id}/scene").json()


def test_unknown_template_scene_is_not_found(tmp_path):
    missing = TestClient(create_app(tmp_path)).get("/library/templates/no_such_template/scene")
    assert missing.status_code == 404
    assert missing.json()["code"] == "not_found"


def test_vault_body_scene_draws_the_body_on_the_ground_and_unknown_ones_are_not_found(tmp_path):
    client = TestClient(create_app(tmp_path))
    scene = client.get("/library/bodies/spider/scene")
    assert scene.status_code == 200
    names = {geom["name"] for geom in scene.json()["geoms"]}
    assert {"cephalothorax", "abdomen", "leg_l1_foot"} <= names
    assert client.get("/library/bodies/dragon/scene").status_code == 404
