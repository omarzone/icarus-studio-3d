from fastapi.testclient import TestClient

from icarus.api.app import create_app
from icarus.contracts.training import StartRun
from icarus.run_relay import RunRelay
from tests.copilot.test_autopilot import ScriptedTrainer


def make_app(tmp_path):
    return create_app(tmp_path / "projects", tmp_path / "runs", tmp_path / "settings")


def test_the_app_publishes_revisions_and_serves_tasks_events_and_brain_routes(tmp_path):
    app = make_app(tmp_path)
    with TestClient(app) as client:
        listener = app.state.events.subscribe(types=frozenset({"revision_created"}))
        created = client.post("/projects", json={"name": "Parking", "template": "parking_car"}).json()
        event = listener.get(timeout=5)
        assert event is not None and event.project_id == created["project"]["id"]
        assert client.get("/tasks").json() == []
        assert client.delete("/tasks/missing").status_code == 404
        assert client.get("/runs/missing/network").json()["code"] == "not_found"
        assert "No route" not in client.get("/runs/missing/network").json()["message"]
    assert (tmp_path / "settings" / "logs" / "events.jsonl").is_file()


def test_tasks_left_running_by_a_previous_engine_are_marked_stopped(tmp_path):
    (tmp_path / "settings").mkdir()
    (tmp_path / "settings" / "tasks.json").write_text(
        '[{"id":"a1","project_id":null,"kind":"diagnosis","state":"running","title":"Diagnose",'
        '"started_at":"2026-01-01T00:00:00Z"}]'
    )
    app = make_app(tmp_path)
    with TestClient(app) as client:
        assert client.get("/tasks").json()[0]["state"] == "stopped"


def test_the_relay_republishes_run_events_and_hands_coached_checkpoints_on(tmp_path):
    app = make_app(tmp_path)
    store, runs = app.state.store, app.state.runs
    state = store.create("Parking", "parking_car")
    run_id = ScriptedTrainer(runs, [[0.2, 0.3]]).start(state, StartRun(total_steps=100_000, copies=1), 1, False).run_id
    published, coached = [], []

    def publish(event, project):
        published.append((event, project))

    relay = RunRelay(runs, lambda: [run_id], publish, lambda run, step: coached.append((run, step)))
    relay.coach(run_id)
    relay.poll()
    kinds = [event.event.type for event, _ in published]
    assert "checkpoint" in kinds and "status" in kinds
    assert all(project == state.project.id for _, project in published)
    assert [run for run, _ in coached] == [run_id, run_id]
