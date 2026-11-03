import struct
from pathlib import Path

import numpy as np
from fastapi import FastAPI
from fastapi.testclient import TestClient

from icarus.api.app import create_app
from icarus.contracts.training import StartRun
from icarus.sim.animated_png import animated_png
from icarus.sim.views import encode_png
from icarus.training.episodes import CheckpointEpisodes, EpisodeRecord
from icarus.training.run_store import RunFolder


def _run(app: FastAPI, client: TestClient) -> RunFolder:
    project = client.post("/projects", json={"name": "Test", "template": "parking_car"}).json()["project"]["id"]
    start = StartRun.model_validate({"total_steps": 10_000, "copies": 1})
    return app.state.runs.folder(app.state.runs.create(app.state.store.state(project), start, threads=1).run_id)


def _checkpoint(folder: RunFolder, step: int, seed: int) -> None:
    from stable_baselines3 import PPO

    from icarus.sim.env import ProjectEnv

    PPO("MlpPolicy", ProjectEnv(folder.project()), seed=seed, device="cpu").save(folder.checkpoint_path(step))


def test_a_test_runs_on_two_checkpoints_and_compares_their_paths(tmp_path: Path) -> None:
    app = create_app(tmp_path / "projects", tmp_path / "runs")
    client = TestClient(app)
    folder = _run(app, client)
    project_id, run_id = folder.config().project_id, folder.path.name
    _checkpoint(folder, 0, seed=0)
    _checkpoint(folder, 5_000, seed=1)

    assert [test["id"] for test in client.get(f"/projects/{project_id}/behavior-tests").json()] == ["standard-starts"]
    draft = {"name": "Start moved", "start_count": 2, "shifts": [{"object": "spawn", "dx": 1.0, "dy": 0.0}]}
    added = client.post(f"/projects/{project_id}/behavior-tests", json=draft).json()
    assert added["id"] == "start-moved"
    assert added["starts"] == [20_100, 20_101]

    first = client.post(f"/runs/{run_id}/checkpoints/0/behavior-tests/start-moved").json()
    assert len(first["episodes"]) == 2
    assert first["passed"] == (first["passed_share"] >= 0.8)
    assert all(len(episode["path"]) >= 2 for episode in first["episodes"])
    again = client.post(f"/runs/{run_id}/checkpoints/0/behavior-tests/start-moved").json()
    assert [e["path"] for e in again["episodes"]] == [e["path"] for e in first["episodes"]]
    client.post(f"/runs/{run_id}/checkpoints/5000/behavior-tests/start-moved")
    assert [(r["step"], r["test"]["id"]) for r in client.get(f"/runs/{run_id}/behavior-tests").json()] == [
        (0, "start-moved"),
        (5_000, "start-moved"),
    ]

    query = f"test=start-moved&a={run_id}&a_step=0&b={run_id}"
    same = client.get(f"/behavior-tests/compare?{query}&b_step=0").json()
    assert same["path_gap"] == 0
    assert same["similarity"] == 1
    assert all(row["close"] for row in same["rows"])
    other = client.get(f"/behavior-tests/compare?{query}&b_step=5000").json()
    assert other["a"]["step"] == 0 and other["b"]["step"] == 5_000
    assert [row["label"] for row in other["rows"]][:2] == ["Passed", "Episode length"]
    missing = client.get(f"/behavior-tests/compare?test=standard-starts&a={run_id}&a_step=0&b={run_id}&b_step=0")
    assert missing.status_code == 404


def test_tests_refuse_unknown_objects_and_the_standard_test_stays(tmp_path: Path) -> None:
    app = create_app(tmp_path / "projects", tmp_path / "runs")
    client = TestClient(app)
    folder = _run(app, client)
    project_id, run_id = folder.config().project_id, folder.path.name
    _checkpoint(folder, 0, seed=0)
    draft = {"name": "Wall moved", "start_count": 1, "shifts": [{"object": "nowhere", "dx": 1.0, "dy": 0.0}]}
    client.post(f"/projects/{project_id}/behavior-tests", json=draft)

    refused = client.post(f"/runs/{run_id}/checkpoints/0/behavior-tests/wall-moved")
    assert refused.status_code == 422
    assert "nowhere" in refused.json()["message"]
    assert client.post(f"/runs/{run_id}/checkpoints/0/behavior-tests/unknown").status_code == 404
    assert client.delete(f"/projects/{project_id}/behavior-tests/standard-starts").status_code == 422
    left = client.delete(f"/projects/{project_id}/behavior-tests/wall-moved").json()
    assert [test["id"] for test in left] == ["standard-starts"]


def test_checkpoint_episodes_say_pass_or_fail(tmp_path: Path) -> None:
    app = create_app(tmp_path / "projects", tmp_path / "runs")
    client = TestClient(app)
    folder = _run(app, client)
    records = [
        EpisodeRecord(index=0, seed=10_000, success=True, fell=False, seconds=8.0, episode_return=3.0, forward=1.0),
        EpisodeRecord(index=1, seed=10_001, success=False, fell=True, seconds=1.0, episode_return=-1.0, forward=0.0),
    ]
    folder.write_episodes(CheckpointEpisodes(step=0, has_goal=True, episode_seconds=30.0, episodes=records))

    episodes = client.get(f"/runs/{folder.path.name}/checkpoints/0/episodes").json()
    assert [(e["passed"], e["ending"]) for e in episodes] == [(True, "Reached the goal"), (False, "Fell early")]
    assert client.get(f"/runs/{folder.path.name}/checkpoints/9/episodes").status_code == 404


def test_episode_activations_cover_every_neuron_over_the_replayed_episode(tmp_path: Path) -> None:
    app = create_app(tmp_path / "projects", tmp_path / "runs")
    client = TestClient(app)
    folder = _run(app, client)
    _checkpoint(folder, 0, seed=0)

    activity = client.get(f"/runs/{folder.path.name}/episode-activations?step=0").json()
    assert activity["frames"] > 0
    assert [layer["size"] for layer in activity["layers"]] == [64, 64]
    assert all(len(layer["neurons"]) == 64 for layer in activity["layers"])
    # No rollout was recorded for this checkpoint, so nothing claims to match one.
    assert activity["matches_recording"] is False
    assert client.get(f"/runs/{folder.path.name}/episode-activations?step=7").status_code == 404


def test_a_recording_without_kept_states_cannot_be_exported(tmp_path: Path) -> None:
    app = create_app(tmp_path / "projects", tmp_path / "runs")
    client = TestClient(app)
    folder = _run(app, client)
    assert client.post(f"/runs/{folder.path.name}/checkpoints/0/recording").status_code == 404


def test_animated_png_keeps_every_frame_in_order() -> None:
    frames = [encode_png(np.full((4, 6, 3), shade, np.uint8)) for shade in (10, 120, 240)]
    data = animated_png(frames, delay_ms=125)
    assert data.startswith(b"\x89PNG\r\n\x1a\n")
    at = data.index(b"acTL")
    assert struct.unpack(">II", data[at + 4 : at + 12]) == (3, 0)
    assert data.count(b"fcTL") == 3
    assert data.count(b"fdAT") == 2
    assert data.endswith(b"IEND\xaeB`\x82")
