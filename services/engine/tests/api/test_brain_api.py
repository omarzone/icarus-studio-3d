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
