import base64
import json
import math
import struct
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


def _glb(data: bytes) -> tuple[dict, bytes]:
    """The JSON and binary chunks of a .glb, after checking its header and chunk lengths."""
    magic, version, length = struct.unpack_from("<III", data, 0)
    assert (magic, version, length) == (0x46546C67, 2, len(data))
    json_length, json_type = struct.unpack_from("<II", data, 12)
    assert json_type == 0x4E4F534A and json_length % 4 == 0
    document = json.loads(data[20 : 20 + json_length])
    binary_length, binary_type = struct.unpack_from("<II", data, 20 + json_length)
    assert binary_type == 0x004E4942 and 28 + json_length + binary_length == len(data)
    binary = data[28 + json_length :]
    assert document["buffers"][0]["byteLength"] <= binary_length
    for accessor in document["accessors"]:
        view = document["bufferViews"][accessor["bufferView"]]
        size = {"SCALAR": 1, "VEC3": 3, "VEC4": 4, "MAT4": 16}[accessor["type"]]
        width = {5126: 4, 5123: 2}[accessor["componentType"]]
        assert accessor["count"] * size * width == view["byteLength"]
        assert view["byteOffset"] + view["byteLength"] <= binary_length
    return document, binary


def _floats(document: dict, binary: bytes, accessor: int) -> list[float]:
    view = document["bufferViews"][document["accessors"][accessor]["bufferView"]]
    return list(struct.unpack_from(f"<{view['byteLength'] // 4}f", binary, view["byteOffset"]))


def test_the_reference_exports_as_a_skinned_gltf_animation_of_its_frames(client, project_id):
    _connect_pose(client)
    client.post(f"/projects/{project_id}/motion/videos", json=_video())
    _tracked(client, project_id)
    request = {"source": "reference", "root_motion": False}
    exported = client.post(f"/projects/{project_id}/motion/export", json=request | {"format": "gltf"}).json()
    assert exported["name"] == "walk-reference.glb" and exported["media_type"] == "model/gltf-binary"
    assert exported["encoding"] == "base64" and exported["frames"] == FRAMES
    document, binary = _glb(base64.b64decode(exported["content"]))

    skin = document["skins"][0]
    assert len(skin["joints"]) == 11 and document["nodes"][skin["skeleton"]]["name"] == "Hips"
    assert document["accessors"][skin["inverseBindMatrices"]]["count"] == 11
    body = next(node for node in document["nodes"] if "mesh" in node)
    assert body["skin"] == 0 and "JOINTS_0" in document["meshes"][0]["primitives"][0]["attributes"]
    animation = document["animations"][0]
    assert len(animation["channels"]) == 12
    for sampler in animation["samplers"]:
        assert document["accessors"][sampler["input"]]["count"] == FRAMES
        assert document["accessors"][sampler["output"]]["count"] == FRAMES
    times = _floats(document, binary, animation["samplers"][0]["input"])
    assert times == pytest.approx([index / 2.0 for index in range(FRAMES)])

    # Every joint turns exactly as the BVH of the same frames says.
    bvh = client.post(f"/projects/{project_id}/motion/export", json=request | {"format": "bvh"}).json()
    rows = [[float(value) for value in line.split()] for line in bvh["content"].splitlines()[-FRAMES:]]
    rotations = [channel for channel in animation["channels"] if channel["target"]["path"] == "rotation"]
    assert any(abs(row[3 + 7 * 3]) > 1 for row in rows)
    for channel in rotations:
        joint = channel["target"]["node"]
        quaternions = _floats(document, binary, animation["samplers"][channel["sampler"]]["output"])
        for frame, row in enumerate(rows):
            x, y, z, w = quaternions[frame * 4 : frame * 4 + 4]
            assert (x, y) == (0.0, 0.0)
            assert math.degrees(2 * math.atan2(z, w)) == pytest.approx(row[3 + joint * 3], abs=1e-3)
