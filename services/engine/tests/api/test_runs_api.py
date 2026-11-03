import json
import os
import subprocess
import sys
import time
from collections.abc import Callable, Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from icarus.api.app import create_app
from icarus.contracts.training import LogLine, MetricPoint, Rollout, StartRun, TrainingSnapshot
from icarus.training.run_store import RunFolder
from icarus.training.supervisor import Supervisor
from tests.api.test_play_api import opened

FAKE_WORKER = Path(__file__).parents[1] / "training" / "fake_worker.py"
START = {"total_steps": 10_000, "copies": 1}


def make_app(tmp_path: Path, mode: str = "obey") -> FastAPI:
    app = create_app(tmp_path / "projects", tmp_path / "runs")

    def command(run_dir: Path, use_graphics_card: bool) -> list[str]:
        return [sys.executable, str(FAKE_WORKER), str(run_dir), mode]

    app.state.supervisor = Supervisor(app.state.runs, command=command)
    return app


def new_project(client: TestClient, template: str = "parking_car") -> str:
    return client.post("/projects", json={"name": "Test", "template": template}).json()["project"]["id"]


def wait_for(condition: Callable[[], bool], timeout: float = 30.0) -> None:
    deadline = time.monotonic() + timeout
    while not condition():
        assert time.monotonic() < deadline, "Timed out"
        time.sleep(0.02)


def events(lines: Iterator[str]) -> Iterator[dict]:
    for line in lines:
        if line.startswith("data: "):
            yield json.loads(line.removeprefix("data: "))["event"]


def stored_run(app: FastAPI, client: TestClient) -> RunFolder:
    """A run created on disk without a worker, so a test can write its files by hand."""
    state = app.state.store.state(new_project(client))
    return app.state.runs.folder(app.state.runs.create(state, StartRun.model_validate(START), threads=1).run_id)


def metric(kind, step) -> MetricPoint:
    return MetricPoint(kind=kind, step=step, elapsed=1, episode_return=2, episode_length=600, reward_terms={})


def test_a_run_starts_lists_stops_and_serves_its_timeline(tmp_path):
    client = TestClient(make_app(tmp_path))
    project_id = new_project(client)
    started = client.post(f"/projects/{project_id}/runs", json=START)
    assert started.status_code == 201
    run = started.json()
    assert (run["state"], run["name"], run["revision_number"], run["total_steps"]) == ("starting", "Run 1", 1, 10_000)
    run_id = run["run_id"]

    busy = client.post(f"/projects/{project_id}/runs", json=START)
    assert busy.status_code == 409 and busy.json()["code"] == "conflict" and "Run 1" in busy.json()["message"]
    assert [item["run_id"] for item in client.get(f"/projects/{project_id}/runs").json()] == [run_id]
    wait_for(lambda: client.get(f"/runs/{run_id}").json()["state"] == "running")
    assert client.post(f"/runs/{run_id}/pause").json()["paused"] is True
    assert client.get(f"/runs/{run_id}").json()["paused"] is True
    assert client.post(f"/runs/{run_id}/resume").json()["paused"] is False

    assert client.post(f"/runs/{run_id}/stop").json()["state"] == "stopping"
    wait_for(lambda: client.get(f"/runs/{run_id}").json()["state"] == "stopped")
    refused = client.post(f"/runs/{run_id}/pause")
    assert refused.status_code == 409 and "not training" in refused.json()["message"]
    assert [point["kind"] for point in client.get(f"/runs/{run_id}/metrics").json()] == ["eval"]
    assert client.get(f"/runs/{run_id}/checkpoints").json() == [
        {"step": 0, "episode_return": 0.0, "success_rate": None, "failure_rate": None, "has_rollout": True}
    ]
    assert client.get(f"/runs/{run_id}/rollouts/0").json()["outcome"] == "Time ran out"
    missing = client.get(f"/runs/{run_id}/rollouts/5000")
    assert missing.status_code == 404 and missing.json()["code"] == "not_found"


def test_unknown_runs_and_projects_answer_404(tmp_path):
    client = TestClient(make_app(tmp_path))
    for path in ("/runs/run-20260101T000000Z-abcd", "/runs/nope/metrics", "/projects/0123456789ab/runs"):
        response = client.get(path)
        assert response.status_code == 404 and response.json()["code"] == "not_found"


def test_a_project_that_cannot_train_or_a_bad_request_is_rejected(tmp_path):
    client = TestClient(make_app(tmp_path))
    empty = client.post(f"/projects/{new_project(client, 'empty_world')}/runs", json=START)
    assert empty.status_code == 422 and "navigation and locomotion" in empty.json()["message"]
    bad = client.post(f"/projects/{new_project(client)}/runs", json={"total_steps": 10, "copies": 0})
    assert bad.status_code == 422 and set(bad.json()["details"]) == {"body.total_steps", "body.copies"}


def test_the_event_stream_of_a_finished_run_replays_its_history_and_ends_with_the_status(tmp_path):
    app = make_app(tmp_path)
    client = TestClient(app)
    folder = stored_run(app, client)
    folder.write_rollout(Rollout(step=0, seed=10_000, geoms=[], frames=[], episode_return=2, outcome="Time ran out"))
    folder.append_metric(metric("eval", 0))
    folder.append_metric(metric("train", 2048))
    folder.append_log(LogLine(elapsed=0.5, level="info", text="Training finished"))
    folder.write_status(folder.status().model_copy(update={"state": "done", "finished_at": datetime.now(UTC)}))

    with client.stream("GET", f"/runs/{folder.run_id}/events") as response:
        assert response.headers["content-type"].startswith("text/event-stream")
        received = list(events(response.iter_lines()))
    assert [event["type"] for event in received] == ["metric", "checkpoint", "metric", "log", "status"]
    assert received[1]["checkpoint"] == {
        "step": 0,
        "episode_return": 2.0,
        "success_rate": None,
        "failure_rate": None,
        "has_rollout": True,
    }
    assert received[-1]["status"]["state"] == "done"


def test_the_event_stream_follows_a_running_run_until_it_finishes(tmp_path):
    app = make_app(tmp_path)
    client = TestClient(app)
    folder = stored_run(app, client)
    folder.write_status(folder.status().model_copy(update={"state": "running"}))
    folder.write_snapshot(TrainingSnapshot(step=512, geoms=["car"], copies=[]))

    with client.stream("GET", f"/runs/{folder.run_id}/events") as response:
        stream = events(response.iter_lines())
        seen = [next(stream), next(stream)]
        assert sorted(event["type"] for event in seen) == ["snapshot", "status"]
        folder.append_metric(metric("train", 2048))
        folder.write_status(folder.status().model_copy(update={"state": "done", "step": 2048}))
        rest = list(stream)
    assert [event["type"] for event in rest] == ["metric", "status"]
    assert rest[-1]["status"]["step"] == 2048


def test_training_settings_default_persist_and_reject_too_many_threads(tmp_path):
    client = TestClient(make_app(tmp_path))
    settings = client.get("/settings/training").json()
    cores = os.cpu_count() or 1
    assert settings["max_threads"] == cores and 1 <= settings["threads"] <= cores
    assert settings["runs_folder"] == str(tmp_path / "runs")
    assert settings["projects_folder"] == str(tmp_path / "projects")

    assert client.put("/settings/training", json={"threads": 1}).json()["threads"] == 1
    assert TestClient(make_app(tmp_path)).get("/settings/training").json()["threads"] == 1
    too_many = client.put("/settings/training", json={"threads": cores + 1})
    assert too_many.status_code == 422 and "threads" in too_many.json()["details"]
    assert client.put("/settings/training", json={"extra": 1}).status_code == 422


@pytest.mark.parametrize("state", ["done", "stopped", "failed"])
def test_play_drives_the_body_with_the_best_checkpoint_of_the_current_revision(tmp_path, state):
    from stable_baselines3 import PPO

    from icarus.sim.env import ProjectEnv

    app = make_app(tmp_path)
    client = TestClient(app)
    folder = stored_run(app, client)
    PPO("MlpPolicy", ProjectEnv(folder.project()), seed=0, device="cpu").save(folder.checkpoint_path(25_000))
    folder.write_status(folder.status().model_copy(update={"state": state, "best_step": 25_000}))

    with client.websocket_connect(f"/projects/{folder.project().id}/play") as socket:
        ready = opened(socket)
    assert ready["session"]["brain"] == "Trained brain: Run 1 at 25,000 steps"


def edit(target: str, component: str, prop: str, value: dict) -> dict:
    return {
        "summary": f"Set {prop}",
        "operations": [
            {"op": "set_property", "object": target, "component": component, "property": prop, "value": value}
        ],
    }


LOOK_EDITS = {
    "time of day": [
        edit("sky", "sky", "use_clock", {"type": "switch", "value": True}),
        edit("sky", "sky", "clock_time", {"type": "slider", "value": 18.5}),
    ],
    "car color": [edit("car", "material", "color", {"type": "color", "value": "#d23b3b"})],
    "sun light": [edit("sun", "light", "intensity", {"type": "slider", "value": 2})],
    "ray name": [edit("car", "distance_ray", "name", {"type": "text", "value": "Nose"})],
    "practice settings": [
        {
            "operations": [{"op": "set_brain", "training_steps": 200_000, "ppo": {"learning_rate": 0.001}}],
            "summary": "Practice",
        }
    ],
    "project name": [{"operations": [{"op": "rename_project", "name": "Renamed"}], "summary": "Rename"}],
}


@pytest.mark.parametrize("look", LOOK_EDITS)
def test_play_keeps_the_trained_brain_after_a_change_that_only_alters_the_look(tmp_path, look):
    from stable_baselines3 import PPO

    from icarus.sim.env import ProjectEnv

    app = make_app(tmp_path)
    client = TestClient(app)
    folder = stored_run(app, client)
    project_id = folder.project().id
    PPO("MlpPolicy", ProjectEnv(folder.project()), seed=0, device="cpu").save(folder.checkpoint_path(25_000))
    folder.write_status(folder.status().model_copy(update={"state": "done", "best_step": 25_000}))
    for batch in LOOK_EDITS[look]:
        assert client.post(f"/projects/{project_id}/operations", json=batch).status_code == 200, batch

    with client.websocket_connect(f"/projects/{project_id}/play") as socket:
        ready = opened(socket)
    assert ready["session"]["brain"] == "Trained brain: Run 1 at 25,000 steps"


@pytest.mark.parametrize("change", ["still training", "newer revision", "unreadable checkpoint", "never trained"])
def test_play_keeps_the_untrained_brain_without_a_usable_finished_run(tmp_path, change):
    from stable_baselines3 import PPO

    from icarus.sim.env import ProjectEnv

    app = make_app(tmp_path)
    client = TestClient(app)
    folder = stored_run(app, client)
    project_id = folder.project().id
    best = 0 if change == "never trained" else 25_000
    if change == "unreadable checkpoint":
        folder.checkpoint_path(best).write_bytes(b"not a checkpoint")
    else:
        PPO("MlpPolicy", ProjectEnv(folder.project()), seed=0, device="cpu").save(folder.checkpoint_path(best))
    state = "running" if change == "still training" else "done"
    folder.write_status(folder.status().model_copy(update={"state": state, "best_step": best}))
    if change == "newer revision":
        heavier = edit("car", "physics_body", "mass", {"type": "number", "value": 3})
        assert client.post(f"/projects/{project_id}/operations", json=heavier).status_code == 200
    with client.websocket_connect(f"/projects/{project_id}/play") as socket:
        brain = opened(socket)["session"]["brain"]
    if change == "never trained":
        assert brain == "Untrained brain: Run 1 did not beat random actions yet"
    else:
        assert brain == "Untrained brain: random actions"


def test_the_api_serves_runs_without_loading_the_training_stack(tmp_path):
    script = (
        "import sys; from pathlib import Path; from fastapi.testclient import TestClient; "
        "from icarus.api.app import create_app; "
        "client = TestClient(create_app(Path(sys.argv[1]), Path(sys.argv[2]))); "
        "pid = client.post('/projects', json={'name': 'T', 'template': 'parking_car'}).json()['project']['id']; "
        "assert client.get(f'/projects/{pid}/runs').status_code == 200; "
        "assert client.get('/settings/training').status_code == 200; "
        "loaded = [name for name in ('torch', 'stable_baselines3') if name in sys.modules]; "
        "assert not loaded, loaded"
    )
    args = [sys.executable, "-c", script, str(tmp_path / "projects"), str(tmp_path / "runs")]
    result = subprocess.run(args, capture_output=True, text=True, timeout=120)
    assert result.returncode == 0, result.stderr


def test_closing_the_engine_stops_the_run_in_training(tmp_path):
    app = make_app(tmp_path)
    with TestClient(app) as client:
        run_id = client.post(f"/projects/{new_project(client)}/runs", json=START).json()["run_id"]
        wait_for(lambda: client.get(f"/runs/{run_id}").json()["state"] == "running")
    assert app.state.runs.folder(run_id).status().state == "stopped"


def test_a_run_serves_the_scene_it_was_trained_in_after_the_project_changes(tmp_path):
    app = make_app(tmp_path)
    client = TestClient(app)
    folder = stored_run(app, client)
    project_id = folder.project().id
    before = client.get(f"/projects/{project_id}/scene").json()
    change = {"operations": [{"op": "rename_project", "name": "Renamed"}], "summary": "Rename"}
    assert client.post(f"/projects/{project_id}/operations", json=change).status_code == 200

    assert client.get(f"/projects/{project_id}/scene").json()["revision"] == 2
    scene = client.get(f"/runs/{folder.run_id}/scene")
    assert scene.status_code == 200
    assert scene.json() == before and before["revision"] == 1
    missing = client.get("/runs/run-20260101T000000Z-abcd/scene")
    assert missing.status_code == 404 and missing.json()["code"] == "not_found"
