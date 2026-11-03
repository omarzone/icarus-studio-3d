from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from icarus.api import brain
from icarus.api.app import create_app
from icarus.contracts.training import StartRun
from icarus.training.run_store import RunFolder


def _app(tmp_path: Path) -> FastAPI:
    app = create_app(tmp_path / "projects", tmp_path / "runs")
    if not any(getattr(route, "path", "") == "/runs/{run_id}/network" for route in app.routes):
        app.include_router(brain.router)
    return app


def _run(app: FastAPI, client: TestClient) -> RunFolder:
    project = client.post("/projects", json={"name": "Test", "template": "parking_car"}).json()["project"]["id"]
    start = StartRun.model_validate({"total_steps": 10_000, "copies": 1})
    return app.state.runs.folder(app.state.runs.create(app.state.store.state(project), start, threads=1).run_id)


def test_the_network_and_activations_of_the_best_checkpoint(tmp_path):
    from stable_baselines3 import PPO

    from icarus.sim.env import ProjectEnv

    app = _app(tmp_path)
    client = TestClient(app)
    folder = _run(app, client)
    PPO("MlpPolicy", ProjectEnv(folder.project()), seed=0, device="cpu").save(folder.checkpoint_path(5_000))
    folder.write_status(folder.status().model_copy(update={"best_step": 5_000}))
    run_id = folder.path.name

    network = client.get(f"/runs/{run_id}/network").json()
    assert network["step"] == 5_000
    assert [layer["size"] for layer in network["layers"]] == [64, 64]
    activations = client.get(f"/runs/{run_id}/activations?step=5000").json()
    assert [len(layer) for layer in activations["layers"]] == [64, 64]
    assert len(activations["outputs"]) == len(network["outputs"])


def test_unknown_runs_and_missing_checkpoints_answer_404(tmp_path):
    app = _app(tmp_path)
    client = TestClient(app)
    folder = _run(app, client)
    assert client.get("/runs/nope/network").status_code == 404
    response = client.get(f"/runs/{folder.path.name}/activations?step=123")
    assert response.status_code == 404
    assert "checkpoint" in response.json()["message"]


def test_readings_and_behaviors_of_a_checkpoint_come_from_its_episodes(tmp_path):
    from stable_baselines3 import PPO

    from icarus.sim.env import ProjectEnv
    from icarus.training.episodes import CheckpointEpisodes, EpisodeRecord

    app = _app(tmp_path)
    client = TestClient(app)
    folder = _run(app, client)
    PPO("MlpPolicy", ProjectEnv(folder.project()), seed=0, device="cpu").save(folder.checkpoint_path(5_000))
    run_id = folder.path.name

    readings = client.get(f"/runs/{run_id}/readings?step=5000").json()
    assert 0 < readings["seconds"] <= 1.0
    assert [item["label"] for item in readings["actions"]] == ["Throttle", "Brake", "Steering"]
    assert all(item["min"] <= item["value"] <= item["max"] for item in readings["actions"])
    assert client.get(f"/runs/{run_id}/behaviors?step=5000").json()["behaviors"] == []

    record = EpisodeRecord(index=0, seed=1, success=True, fell=False, seconds=9.5, episode_return=3, forward=1)
    folder.write_episodes(CheckpointEpisodes(step=5_000, has_goal=True, episode_seconds=30, episodes=[record]))
    behaviors = client.get(f"/runs/{run_id}/behaviors?step=5000").json()["behaviors"]
    assert [(item["id"], item["episodes"], item["seconds"]) for item in behaviors] == [("reached_goal", 1, 9.5)]


def test_brain_sizes_and_sources_of_a_project(tmp_path):
    app = _app(tmp_path)
    client = TestClient(app)
    project = client.post("/projects", json={"name": "Car", "template": "parking_car"}).json()["project"]["id"]
    sizes = client.get(f"/projects/{project}/brain/sizes").json()
    assert [size["id"] for size in sizes["sizes"]] == ["small", "medium", "large"]
    assert sizes["senses"] > 0 and sizes["motors"] == 3
    sources = client.get(f"/projects/{project}/brain/sources").json()
    assert sources["options"] == [] and sources["selected"] is None
