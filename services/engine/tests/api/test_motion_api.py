import base64
import json
import time
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from icarus.api.app import create_app
from icarus.contracts.copilot import ModelSettingsPatch
from icarus.contracts.training import RunStatus, StartRun

# Pose fixtures answer by frame number (tests/copilot/fixtures/pose): frame 4 shows nobody.
FRAMES = 4


def _picture(index: int) -> str:
    return base64.b64encode(b"\xff\xd8\xff" + bytes([index]) * 32).decode()


def _video() -> dict:
    return {
        "name": "walk.mp4",
        "duration": 2.0,
        "fps": 2.0,
        "width": 640,
        "height": 480,
        "frames": [_picture(index) for index in range(FRAMES)],
    }


@pytest.fixture
def client(tmp_path) -> TestClient:
    return TestClient(create_app(tmp_path))


@pytest.fixture
def project_id(client) -> str:
    return client.post("/projects", json={"name": "Copy", "template": "humanoid"}).json()["project"]["id"]


def _connect_pose(client: TestClient) -> None:
    patch = ModelSettingsPatch(endpoint="http://fixtures.invalid/v1", models={"pose": "pose-fixture"})
    client.app.state.model_settings.update(patch)  # type: ignore[attr-defined]


def _tracked(client: TestClient, project_id: str) -> dict:
    started = client.post(f"/projects/{project_id}/motion/tracking")
    assert started.status_code == 202, started.text
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        tracking = client.get(f"/projects/{project_id}/motion").json()["tracking"]
        if tracking["state"] != "running":
            assert tracking["state"] == "done", tracking
            return client.get(f"/projects/{project_id}/motion").json()
        time.sleep(0.05)
    raise AssertionError("tracking did not finish")


def test_without_a_pose_model_tracking_says_to_connect_one(client, project_id):
    workspace = client.get(f"/projects/{project_id}/motion").json()
    assert workspace["clip"] is None and workspace["pose_model"] is None
    assert client.post(f"/projects/{project_id}/motion/tracking").status_code == 404
    clip = client.post(f"/projects/{project_id}/motion/videos", json=_video())
    assert clip.status_code == 201 and clip.json()["target"] == "humanoid_body"
    refused = client.post(f"/projects/{project_id}/motion/tracking")
    assert refused.status_code == 503
    assert "Connect a pose model" in refused.json()["message"]


def test_a_video_is_tracked_frame_by_frame_with_the_pose_model(client, project_id):
    _connect_pose(client)
    client.post(f"/projects/{project_id}/motion/videos", json=_video())
    workspace = _tracked(client, project_id)
    clip = workspace["clip"]
    assert workspace["pose_model"] == "pose-fixture"
    assert len(clip["frames"]) == FRAMES and clip["people"] == 2
    # The largest person is the full figure, not the far head; the last frame shows nobody.
    assert len(clip["frames"][0]["keypoints"]) == 14
    assert clip["frames"][3]["keypoints"] == []
    frame = client.get(f"/projects/{project_id}/motion/frames/1")
    assert frame.status_code == 200 and frame.headers["content-type"] == "image/jpeg"


def test_choosing_another_person_asks_for_tracking_again(client, project_id):
    _connect_pose(client)
    client.post(f"/projects/{project_id}/motion/videos", json=_video())
    _tracked(client, project_id)
    chosen = client.post(f"/projects/{project_id}/motion/choice", json={"person": "right", "view": "side"}).json()
    assert chosen["person"] == "right" and chosen["frames"] == []
    assert client.post(f"/projects/{project_id}/motion/choice", json={"target": "nobody"}).status_code == 404


def test_training_the_copy_makes_the_task_imitate_the_clip(client, project_id):
    _connect_pose(client)
    client.post(f"/projects/{project_id}/motion/videos", json=_video())
    _tracked(client, project_id)
    started: list[StartRun] = []

    def start(state, request, threads, use_graphics_card):
        started.append(request)
        return RunStatus(
            run_id="run1",
            project_id=state.project.id,
            revision_number=state.revision.number,
            name="Run 1",
            state="starting",
            step=0,
            total_steps=request.total_steps,
            copies=request.copies,
            steps_per_second=0,
            started_at=datetime.now(UTC),
        )

    # A stand-in for the supervisor, so the test checks the revision and the request without training.
    client.app.state.supervisor.start = start  # type: ignore[attr-defined]
    run = client.post(f"/projects/{project_id}/motion/train", json={"total_steps": 20000, "copies": 2})
    assert run.status_code == 201 and run.json()["run_id"] == "run1"
    project = client.get(f"/projects/{project_id}").json()["project"]
    task = project["task"]
    assert task["family"] == "imitation"
    assert {term["term"] for term in task["rewards"]} >= {"track_motion", "stay_upright"}
    segments = {track["segment"]: track["part"] for track in task["motion"]["tracks"]}
    assert segments["left_thigh"] == "thigh_left" and segments["torso"] == "chest"
    assert started[0].total_steps == 20000 and started[0].copies == 2


def test_the_reference_exports_as_json_and_bvh(client, project_id):
    _connect_pose(client)
    client.post(f"/projects/{project_id}/motion/videos", json=_video())
    _tracked(client, project_id)
    exported = client.post(f"/projects/{project_id}/motion/export", json={"format": "json", "source": "reference"})
    document = json.loads(exported.json()["content"])
    assert document["fps"] == 2.0 and len(document["frames"]) == FRAMES
    # Knees ahead of the hip-ankle line: the person faces right, so the left thigh steps forward in frame 2.
    assert document["frames"][1]["angles"]["left_thigh"] > -90
    bvh = client.post(
        f"/projects/{project_id}/motion/export", json={"format": "bvh", "source": "reference", "loop": True}
    ).json()
    assert bvh["name"] == "walk-reference.bvh"
    assert bvh["content"].startswith("HIERARCHY\nROOT Hips") and f"Frames: {FRAMES + 1}" in bvh["content"]
    physics = client.post(f"/projects/{project_id}/motion/export", json={"format": "json", "source": "physics"})
    assert physics.status_code == 404 and "Train the copy first" in physics.json()["message"]
