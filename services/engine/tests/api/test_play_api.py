import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from icarus.api.app import create_app


def files_of(root) -> dict[str, bytes]:
    return {str(path.relative_to(root)): path.read_bytes() for path in sorted(root.rglob("*")) if path.is_file()}


def next_of(socket, kind: str, limit: int = 200) -> dict:
    for _ in range(limit):
        message = socket.receive_json()["message"]
        if message["type"] == kind:
            return message
    raise AssertionError(f"No {kind} message")


def test_a_play_session_streams_frames_takes_commands_and_survives_bad_ones(tmp_path):
    client = TestClient(create_app(tmp_path))
    project_id = client.post("/projects", json={"name": "Parking", "template": "parking_car"}).json()["project"]["id"]
    stored = files_of(tmp_path)
    with client.websocket_connect(f"/projects/{project_id}/play") as socket:
        ready = socket.receive_json()["message"]
        assert ready["type"] == "ready"
        assert ready["session"]["project_id"] == project_id
        assert ready["session"]["revision_number"] == 1
        assert "push" in [tool["id"] for tool in ready["session"]["tools"]]
        times = [next_of(socket, "frame")["frame"]["time"] for _ in range(3)]
        assert times == sorted(times) and times[-1] > times[0]

        socket.send_json({"command": {"tool": "push", "object": "car", "impulse": [900, 0, 0]}})
        assert next_of(socket, "event")["event"]["text"] == "You pushed Car with 900 N·s"

        socket.send_json({"command": {"tool": "teleport"}})
        assert next_of(socket, "error")["message"]
        socket.send_text("not json")
        assert next_of(socket, "error")["message"]
        socket.send_json({"command": {"tool": "push", "object": "nope", "impulse": [1, 0, 0]}})
        assert "nope" in next_of(socket, "error")["message"]

        socket.send_json({"command": {"tool": "add_object", "piece": "box", "position": [4, 0, 0]}})
        assert next_of(socket, "event")["event"]["text"] == "You added Box"
        assert next_of(socket, "frame")["frame"]["time"] > times[-1]
    assert files_of(tmp_path) == stored


def test_an_unknown_project_sends_an_error_and_closes_with_4404(tmp_path):
    client = TestClient(create_app(tmp_path))
    with client.websocket_connect("/projects/0123456789ab/play") as socket:
        assert socket.receive_json()["message"]["type"] == "error"
        with pytest.raises(WebSocketDisconnect) as closed:
            socket.receive_json()
    assert closed.value.code == 4404
