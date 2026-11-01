import threading

import pytest
from fastapi.testclient import TestClient

from icarus.api.app import create_app
from icarus.contracts.operations import OperationBatch, SetProperty
from icarus.contracts.properties import NumberValue
from icarus.projects.store import ProjectStore


@pytest.fixture
def client(tmp_path) -> TestClient:
    return TestClient(create_app(tmp_path))


def created(client: TestClient, template: str = "parking_car") -> str:
    return client.post("/projects", json={"name": "P", "template": template}).json()["project"]["id"]


def raw_mass(value: str) -> str:
    return (
        '{"summary":"m","operations":[{"op":"set_property","object":"car","component":"physics_body",'
        f'"property":"mass","value":{{"type":"number","value":{value}}}}}]}}'
    )


def test_a_nan_value_is_rejected_and_the_project_stays_readable(client):
    project_id = created(client)
    response = client.post(
        f"/projects/{project_id}/operations", content=raw_mass("NaN"), headers={"content-type": "application/json"}
    )
    assert response.status_code == 422
    assert client.get(f"/projects/{project_id}").json()["revision"]["number"] == 1
    assert client.get("/projects").status_code == 200


def test_an_unreadable_project_does_not_break_the_list(tmp_path):
    store = ProjectStore(tmp_path)
    good = store.create("Good", "empty_world").project.id
    broken = store.create("Broken", "empty_world").project.id
    (tmp_path / broken / "snapshots" / "1.json").write_text("{not json", encoding="utf-8")
    assert [summary.id for summary in store.list_projects()] == [good]


def test_a_wrong_type_value_points_at_the_property(client):
    project_id = created(client)
    response = client.post(
        f"/projects/{project_id}/operations", content=raw_mass('"abc"'), headers={"content-type": "application/json"}
    )
    assert response.status_code == 422
    assert response.json()["issues"][0]["path"] == "objects.car.components.physics_body.mass"


def test_reward_params_outside_the_library_are_rejected(client):
    project_id = created(client)
    batch = {
        "summary": "r",
        "operations": [
            {
                "op": "set_reward_term",
                "term": {"term": "reach_goal", "weight": 10, "params": {"anything": {"type": "panel", "value": "x"}}},
            }
        ],
    }
    response = client.post(f"/projects/{project_id}/operations", json=batch)
    assert response.status_code == 422
    assert response.json()["issues"][0]["path"] == "task.rewards.reach_goal.params.anything"


def test_a_physics_engine_failure_is_a_failed_check_not_a_crash(client):
    project_id = created(client, "empty_world")
    boxes = [
        {
            "op": "create_object",
            "target": "world",
            "object": {
                "id": f"box{index}",
                "name": f"Box {index}",
                "parent": None,
                "components": [
                    {"id": "transform", "kind": "transform", "properties": {}},
                    {
                        "id": "mesh",
                        "kind": "mesh",
                        "properties": {"size": {"type": "vector", "value": [0.5, 0.5, 0.5]}},
                    },
                    {"id": "physics_body", "kind": "physics_body", "properties": {}},
                ],
            },
        }
        for index in range(150)
    ]
    response = client.post(f"/projects/{project_id}/operations", json={"summary": "pile", "operations": boxes})
    assert response.status_code == 422
    assert client.get(f"/projects/{project_id}").json()["revision"]["number"] == 1


def test_concurrent_edits_get_distinct_revisions(tmp_path):
    store = ProjectStore(tmp_path)
    project_id = store.create("Walk", "walker_robot").project.id
    errors: list[BaseException] = []

    def edit(mass: float) -> None:
        operation = SetProperty(
            op="set_property",
            object="torso",
            component="physics_body",
            property="mass",
            value=NumberValue(type="number", value=mass),
        )
        try:
            store.apply(project_id, OperationBatch(operations=[operation], summary=f"{mass}"))
        except BaseException as error:  # noqa: BLE001 - the test reports any failure from a worker thread
            errors.append(error)

    threads = [threading.Thread(target=edit, args=(10 + index,)) for index in range(6)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert errors == []
    numbers = [revision.number for revision in store.revisions(project_id)]
    assert numbers == [1, 2, 3, 4, 5, 6, 7]
    assert store.state(project_id).revision.number == 7
