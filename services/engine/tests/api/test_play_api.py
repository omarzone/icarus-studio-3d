from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from icarus.api.app import create_app
from icarus.contracts.copilot import CopilotMessage
from icarus.copilot.conversation_store import ConversationStore


def files_of(root) -> dict[str, bytes]:
    return {str(path.relative_to(root)): path.read_bytes() for path in sorted(root.rglob("*")) if path.is_file()}


def next_of(socket, kind: str, limit: int = 200) -> dict:
    for _ in range(limit):
        message = socket.receive_json()["message"]
        if message["type"] == kind:
            return message
    raise AssertionError(f"No {kind} message")


def opened(socket) -> dict:
    """The first message after the opening progress: the session, or why it could not start."""
    while True:
        message = socket.receive_json()["message"]
        if message["type"] != "progress":
            return message


def test_a_play_session_streams_frames_takes_commands_and_survives_bad_ones(tmp_path):
    client = TestClient(create_app(tmp_path))
    project_id = client.post("/projects", json={"name": "Parking", "template": "parking_car"}).json()["project"]["id"]
    stored = files_of(tmp_path)
    with client.websocket_connect(f"/projects/{project_id}/play") as socket:
        stages = [socket.receive_json()["message"] for _ in range(3)]
        # The app shows what Play waits for before the first frame: compiling, then the brain, then starting.
        assert [(stage["type"], stage["stage"]) for stage in stages] == [
            ("progress", "world"),
            ("progress", "brain"),
            ("progress", "starting"),
        ]
        ready = socket.receive_json()["message"]
        assert ready["type"] == "ready"
        assert "ball" in [piece["id"] for piece in ready["session"]["pieces"]]
        assert ready["session"]["project_id"] == project_id
        assert ready["session"]["revision_number"] == 1
        assert "push" in [tool["id"] for tool in ready["session"]["tools"]]
        times = [next_of(socket, "frame")["frame"]["time"] for _ in range(3)]
        assert times == sorted(times) and times[-1] > times[0]

        socket.send_json({"command": {"tool": "push", "object": "car", "direction": [1, 0, 0], "speed": 1}})
        assert next_of(socket, "event")["event"]["text"].startswith("You pushed Car with")

        socket.send_json({"command": {"tool": "teleport"}})
        assert next_of(socket, "error")["message"]
        socket.send_text("not json")
        assert next_of(socket, "error")["message"]
        socket.send_json({"command": {"tool": "push", "object": "nope", "direction": [1, 0, 0], "speed": 1}})
        assert "nope" in next_of(socket, "error")["message"]

        socket.send_json({"command": {"tool": "add_object", "piece": "box", "position": [4, 0, 0]}})
        assert next_of(socket, "event")["event"]["text"] == "You added Box"
        assert next_of(socket, "frame")["frame"]["time"] > times[-1]
    assert files_of(tmp_path) == stored


def test_play_speaks_the_language_of_the_persons_latest_message(tmp_path):
    client = TestClient(create_app(tmp_path))
    project_id = client.post("/projects", json={"name": "Parking", "template": "parking_car"}).json()["project"]["id"]
    with ConversationStore(tmp_path).editing(project_id) as conversation:
        conversation.messages.append(
            CopilotMessage(id="m1", role="user", text="hola, quiero ver cómo se mueve", created_at=datetime.now(UTC))
        )
    with client.websocket_connect(f"/projects/{project_id}/play") as socket:
        next_of(socket, "ready")
        socket.send_json({"command": {"tool": "add_object", "piece": "box", "position": [4, 0, 0]}})
        assert next_of(socket, "event")["event"]["text"] == "Agregaste Box"


def test_an_unknown_project_sends_an_error_and_closes_with_4404(tmp_path):
    client = TestClient(create_app(tmp_path))
    with client.websocket_connect("/projects/0123456789ab/play") as socket:
        assert next_of(socket, "error", limit=4)["message"]
        with pytest.raises(WebSocketDisconnect) as closed:
            socket.receive_json()
    assert closed.value.code == 4404


def test_a_rain_drops_its_copies_over_time_in_the_running_session(tmp_path):
    client = TestClient(create_app(tmp_path))
    project_id = client.post("/projects", json={"name": "P", "template": "parking_car"}).json()["project"]["id"]
    with client.websocket_connect(f"/projects/{project_id}/play") as socket:
        next_of(socket, "ready")
        rain = {"tool": "add_object", "piece": "ball", "position": [4, 0, 0], "placement": "drop", "count": 3}
        socket.send_json({"command": rain | {"interval": 0.05, "spread": 1}})
        ready = next_of(socket, "ready")
        assert [geom["name"] for geom in ready["session"]["scene"]["geoms"]].count("ball") == 1
        assert next_of(socket, "event")["event"]["text"] == "You started dropping 3 × Ball"
        names: set[str] = set()
        while not {"ball_2", "ball_3"} <= names:
            names = {geom["name"] for geom in next_of(socket, "ready")["session"]["scene"]["geoms"]}
        assert "ball" in names


def test_an_unexpected_failure_in_one_command_is_reported_and_the_session_goes_on(tmp_path, monkeypatch):
    from icarus.sim.play import PlaySession

    real_apply = PlaySession.apply

    def failing_apply(self, command):
        if command.tool == "light":
            raise RuntimeError("boom")
        return real_apply(self, command)

    monkeypatch.setattr(PlaySession, "apply", failing_apply)
    client = TestClient(create_app(tmp_path))
    project_id = client.post("/projects", json={"name": "P", "template": "parking_car"}).json()["project"]["id"]
    with client.websocket_connect(f"/projects/{project_id}/play") as socket:
        next_of(socket, "ready")
        socket.send_json({"command": {"tool": "light", "intensity": 2}})
        assert "boom" in next_of(socket, "error")["message"]
        first = next_of(socket, "frame")["frame"]["time"]
        assert next_of(socket, "frame")["frame"]["time"] > first
