import zipfile

from fastapi.testclient import TestClient

from icarus.api.app import create_app


def _client(tmp_path) -> tuple[TestClient, str]:
    client = TestClient(create_app(tmp_path / "projects", tmp_path / "runs"))
    project = client.post("/projects", json={"name": "Park Pilot", "template": "parking_car"}).json()["project"]["id"]
    return client, project


def test_targets_without_a_brain_offer_robot_files_and_a_parts_list(tmp_path):
    client, project = _client(tmp_path)
    targets = {target["kind"]: target["detail"] for target in client.get(f"/projects/{project}/build/targets").json()}
    assert targets["export-brain"] == "Robot files · URDF, MJCF"
    assert targets["hardware"].startswith("Parts list · about $")
    assert targets["game"] == "Needs a trained brain" and "animation" not in targets


def test_the_plan_lists_real_sizes_and_the_export_writes_them_to_the_chosen_zip(tmp_path):
    client, project = _client(tmp_path)
    choice = {"format": "urdf", "options": ["parts", "runtime"]}
    plan = client.post(f"/projects/{project}/export/plan", json=choice).json()
    assert plan["name"] == "park-pilot-r1.zip" and plan["brain"] is None
    assert {item["path"] for item in plan["files"]} == {"robot.urdf", "parts.csv", "README.md"}
    destination = tmp_path / "out" / "robot.zip"
    destination.parent.mkdir()
    response = client.post(f"/projects/{project}/export", json=choice | {"destination": str(destination)})
    assert response.status_code == 201 and response.json()["total_bytes"] == plan["total_bytes"]
    with zipfile.ZipFile(destination) as archive:
        assert sorted(archive.namelist()) == sorted(f"park-pilot-r1/{item['path']}" for item in plan["files"])


def test_an_export_to_a_folder_that_does_not_exist_is_refused(tmp_path):
    client, project = _client(tmp_path)
    body = {"format": "mjcf", "options": [], "destination": str(tmp_path / "nowhere" / "x.zip")}
    response = client.post(f"/projects/{project}/export", json=body)
    assert response.status_code == 422 and "folder" in response.json()["message"]


def test_the_hardware_check_uses_the_chosen_kit_and_answers_404_for_an_unknown_one(tmp_path):
    client, project = _client(tmp_path)
    check = client.post(f"/projects/{project}/hardware/check", json={"kit": "smart_car"}).json()
    assert check["kit"]["id"] == "smart_car" and check["verdict"] in ("pass", "warn", "fail")
    assert {kit["id"] for kit in check["kits"]} >= {"rc_car", "smart_car"} and check["measured_from"] is None
    first = check["rows"][0]["id"]
    skipped = client.post(f"/projects/{project}/hardware/check", json={"kit": "smart_car", "skipped": [first]}).json()
    assert skipped["rows"][0]["status"] == "skipped"
    missing = client.post(f"/projects/{project}/hardware/check", json={"kit": "nope"})
    assert missing.status_code == 404
