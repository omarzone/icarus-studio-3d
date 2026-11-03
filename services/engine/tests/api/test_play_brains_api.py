import pytest
from fastapi.testclient import TestClient
from stable_baselines3 import PPO
from starlette.websockets import WebSocketDisconnect

from icarus.contracts.operations import AddComponent
from icarus.contracts.properties import CountValue, TextValue
from icarus.contracts.training import MetricPoint
from icarus.library.components import default_component
from icarus.sim.env import ProjectEnv
from icarus.training.run_store import RunFolder
from tests.api.test_play_api import opened
from tests.api.test_runs_api import edit, make_app, stored_run


def _trained(folder: RunFolder, step: int, success_rate: float | None = None, state: str = "done") -> None:
    PPO("MlpPolicy", ProjectEnv(folder.project()), seed=0, device="cpu").save(folder.checkpoint_path(step))
    point = MetricPoint(
        kind="eval",
        step=step,
        elapsed=1,
        episode_return=2,
        episode_length=600,
        reward_terms={},
        success_rate=success_rate,
    )
    folder.append_metric(point)
    folder.write_status(folder.status().model_copy(update={"state": state, "best_step": step}))


def _rear_ray() -> dict:
    rear = default_component("distance_ray", "rear")
    rear.properties |= {"name": TextValue(type="text", value="Rear"), "count": CountValue(type="count", value=1)}
    operation = AddComponent(op="add_component", object="car", component=rear)
    return {"summary": "Add a rear ray", "operations": [operation.model_dump(mode="json")]}


def test_every_trained_brain_is_listed_and_one_from_another_body_says_why_it_cannot_play(tmp_path):
    app = make_app(tmp_path)
    client = TestClient(app)
    folder = stored_run(app, client)
    project_id = folder.project().id
    _trained(folder, 25_000, success_rate=0.8)

    listed = client.get(f"/projects/{project_id}/play/brains").json()
    assert [(item["label"], item["fits"], item["default"]) for item in listed] == [
        ("Run 1 · 25k steps · revision 1 · 80% success", True, True)
    ]

    assert client.post(f"/projects/{project_id}/operations", json=_rear_ray()).status_code == 200
    changed = client.get(f"/projects/{project_id}/play/brains").json()
    assert [(item["fits"], item["default"]) for item in changed] == [(False, False)]
    assert changed[0]["reason"].startswith("The body changed: ")
    now, then = (int(word) for word in changed[0]["reason"].split() if word.isdigit())
    assert now == then + 1


def test_runs_still_training_or_never_trained_are_not_offered(tmp_path):
    app = make_app(tmp_path)
    client = TestClient(app)
    running = stored_run(app, client)
    _trained(running, 25_000, state="running")
    assert client.get(f"/projects/{running.project().id}/play/brains").json() == []


def test_play_defaults_to_the_newest_brain_of_an_earlier_revision_that_still_fits(tmp_path):
    app = make_app(tmp_path)
    client = TestClient(app)
    folder = stored_run(app, client)
    project_id = folder.project().id
    _trained(folder, 25_000)
    heavier = edit("car", "physics_body", "mass", {"type": "number", "value": 3})
    assert client.post(f"/projects/{project_id}/operations", json=heavier).status_code == 200

    with client.websocket_connect(f"/projects/{project_id}/play") as socket:
        default = opened(socket)["session"]
    listed = client.get(f"/projects/{project_id}/play/brains").json()

    assert (default["brain"], default["run_id"], default["step"]) == (
        "Trained brain: Run 1 at 25,000 steps, from revision 1",
        folder.run_id,
        25_000,
    )
    assert [item["default"] for item in listed] == [True]


def test_play_stays_random_when_no_trained_brain_fits_the_body(tmp_path):
    app = make_app(tmp_path)
    client = TestClient(app)
    folder = stored_run(app, client)
    project_id = folder.project().id
    _trained(folder, 25_000)
    assert client.post(f"/projects/{project_id}/operations", json=_rear_ray()).status_code == 200

    with client.websocket_connect(f"/projects/{project_id}/play") as socket:
        default = opened(socket)["session"]

    assert (default["brain"], default["run_id"]) == ("Untrained brain: random actions", None)


@pytest.mark.parametrize("problem", ["body changed", "no such step", "no such run"])
def test_a_chosen_brain_that_cannot_play_is_refused_with_the_reason(tmp_path, problem):
    app = make_app(tmp_path)
    client = TestClient(app)
    folder = stored_run(app, client)
    project_id = folder.project().id
    _trained(folder, 25_000)
    run_id, step = folder.run_id, 25_000
    if problem == "body changed":
        assert client.post(f"/projects/{project_id}/operations", json=_rear_ray()).status_code == 200
    elif problem == "no such step":
        step = 5_000
    else:
        run_id = "run-20200101T000000Z-0000"

    with client.websocket_connect(f"/projects/{project_id}/play?run={run_id}&step={step}") as socket:
        message = opened(socket)
        with pytest.raises(WebSocketDisconnect) as closed:
            socket.receive_json()
    assert message["type"] == "error"
    expected = {
        "body changed": "The body changed: ",
        "no such step": "Run 1 has no brain saved at 5,000 steps",
        "no such run": "There is no run",
    }[problem]
    assert message["message"].startswith(expected)
    assert closed.value.code == 4422
