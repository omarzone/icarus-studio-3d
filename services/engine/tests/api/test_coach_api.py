import json

import pytest
from fastapi.testclient import TestClient

from icarus.api.app import create_app
from icarus.contracts.training import StartRun
from icarus.copilot.film_strips import FilmStrips
from icarus.training.progress import RunProgress
from icarus.training.run_store import RunFolder
from tests.copilot.agent_script import answering, script, tool_step
from tests.training.test_episode_frames import _RandomModel

LOOK = tool_step("look_episode", episode=0, step=None)
TIME_PENALTY = {"op": "set_reward_term", "term": {"term": "time_penalty", "weight": -0.02}}


def findings(**overrides) -> dict:
    values = {
        "summary": "The car drives around without finding the parking spot.",
        "observations": ["No evaluation episode reached the spot."],
        "evidence": [{"kind": "frame", "label": "The first episode ends far from the spot", "frame": "e0-start.png"}],
        "hypothesis": "The reward for getting closer is too weak against the time penalty.",
        "next_step": "keep_training",
    }
    return tool_step("diagnosis", **(values | overrides))


@pytest.fixture
def app(tmp_path):
    return create_app(tmp_path / "projects", tmp_path / "runs", tmp_path / "settings")


@pytest.fixture
def client(app) -> TestClient:
    return TestClient(app)


def evaluated_run(app, client: TestClient, steps: tuple[int, ...] = (0,)) -> RunFolder:
    """A run whose checkpoints were evaluated for real with a seeded random brain, pictures included."""
    project_id = client.post("/projects", json={"name": "Parking", "template": "parking_car"}).json()["project"]["id"]
    state = app.state.store.state(project_id)
    status = app.state.runs.create(state, StartRun(total_steps=10_000, copies=1), threads=1, evaluation_episodes=3)
    folder = app.state.runs.folder(status.run_id)
    progress = RunProgress(folder)
    for step in steps:
        progress.checkpoint(_RandomModel(), step, step)
    progress.finish("done", steps[-1])
    return folder


@pytest.mark.needs_gl
def test_a_diagnosis_is_grounded_stored_and_posted_with_its_pictures(app, client, monkeypatch, tmp_path):
    folder = evaluated_run(app, client)
    script(monkeypatch, tmp_path, coach=[{"match": ["diagnose"], **LOOK}, findings(), answering("Keep training.")])

    response = client.post(f"/runs/{folder.run_id}/diagnosis")

    assert response.status_code == 200, response.text
    diagnosis = response.json()
    assert diagnosis["id"] == f"{folder.run_id}-1" and diagnosis["step"] == 0
    assert diagnosis["next_step"] == "keep_training" and diagnosis["proposal_id"] is None
    assert (folder.path / "diagnosis" / "1.json").is_file()
    frame = diagnosis["evidence"][0]["attachment_id"]
    assert client.get(f"/attachments/{frame}/content").headers["content-type"] == "image/png"
    groups = diagnosis["failure_groups"]
    assert groups and abs(sum(group["share"] for group in groups) - 1) < 1e-9
    assert client.get(f"/runs/{folder.run_id}/diagnoses").json() == [diagnosis]
    project_id = diagnosis["project_id"]
    message = client.get(f"/projects/{project_id}/conversation").json()["messages"][-1]
    assert message["role"] == "copilot" and message["text"] == "Keep training."
    assert len(message["attachments"]) == 2 and message["attachments"][0]["kind"] == "view"
    assert [step["tool"] for step in message["steps"]] == ["look", "inspect"]
    assert {action["kind"] for action in message["actions"]} == {"navigate", "send"}


@pytest.mark.needs_gl
def test_a_diagnosis_citing_a_number_not_in_the_run_is_rejected(app, client, monkeypatch, tmp_path):
    folder = evaluated_run(app, client)
    invented = findings(summary="The car reaches the spot in 41.7% of episodes.")
    script(monkeypatch, tmp_path, coach=[{"match": ["diagnose"], **LOOK}, invented, findings(), answering("Done.")])

    diagnosis = client.post(f"/runs/{folder.run_id}/diagnosis").json()

    assert "41.7" not in diagnosis["summary"]
    assert diagnosis["summary"] == "The car drives around without finding the parking spot."
    steps = client.get(f"/projects/{diagnosis['project_id']}/conversation").json()["messages"][-1]["steps"]
    assert [step["ok"] for step in steps] == [True, False, True]


def test_stop_and_fix_carries_a_tried_proposal_the_person_can_apply(app, client, monkeypatch, tmp_path):
    folder = evaluated_run(app, client)
    script(
        monkeypatch,
        tmp_path,
        coach=[
            {"match": ["diagnose"], **tool_step("try", operations=[TIME_PENALTY], look=None)},
            tool_step("propose", try_id="t1", summary="Softer time penalty", explanation="Less pressure.", warnings=[]),
            findings(next_step="stop_and_fix", evidence=[]),
            answering("I propose a softer time penalty."),
        ],
    )

    diagnosis = client.post(f"/runs/{folder.run_id}/diagnosis").json()

    assert diagnosis["next_step"] == "stop_and_fix" and diagnosis["proposal_id"]
    conversation = client.get(f"/projects/{diagnosis['project_id']}/conversation").json()
    assert conversation["proposals"][-1]["id"] == diagnosis["proposal_id"]
    assert conversation["messages"][-1]["proposal_id"] == diagnosis["proposal_id"]
    assert client.post(f"/proposals/{diagnosis['proposal_id']}/apply").status_code == 200


def test_a_model_that_writes_no_diagnosis_leaves_one_from_the_run_data(app, client, monkeypatch, tmp_path):
    folder = evaluated_run(app, client)
    script(monkeypatch, tmp_path, coach=[{"match": ["diagnose"], **answering("Looks fine.")}])

    diagnosis = client.post(f"/runs/{folder.run_id}/diagnosis").json()

    assert diagnosis["summary"].startswith("The coach could not finish its diagnosis")
    assert diagnosis["next_step"] == "keep_training" and diagnosis["evidence"] == []


def test_a_run_without_evaluations_cannot_be_diagnosed(app, client):
    project_id = client.post("/projects", json={"name": "Parking", "template": "parking_car"}).json()["project"]["id"]
    state = app.state.store.state(project_id)
    run_id = app.state.runs.create(state, StartRun(total_steps=10_000, copies=1), threads=1).run_id

    response = client.post(f"/runs/{run_id}/diagnosis")

    assert response.status_code == 409 and "no evaluated checkpoint" in response.json()["message"]
    assert client.get(f"/runs/{run_id}/diagnoses").json() == []


@pytest.mark.needs_gl
def test_failure_groups_of_a_checkpoint_come_with_their_pictures(app, client):
    folder = evaluated_run(app, client, steps=(0, 25_000))

    groups = client.get(f"/runs/{folder.run_id}/checkpoints/25000/failures").json()

    episodes = json.loads((folder.frames_folder(25_000) / "episodes.json").read_text(encoding="utf-8"))
    assert sum(round(group["share"] * len(episodes["episodes"])) for group in groups) == 3
    ids = [frame for group in groups for frame in group["frame_attachment_ids"]]
    assert ids and all(client.get(f"/attachments/{frame}/content").status_code == 200 for frame in ids)
    again = client.get(f"/runs/{folder.run_id}/checkpoints/25000/failures").json()
    assert again == groups
    assert client.get(f"/runs/{folder.run_id}/checkpoints/50000/failures").json() == []


def test_two_runs_compare_on_their_evaluation_seeds(app, client):
    first = evaluated_run(app, client)
    second = evaluated_run(app, client)

    response = client.get(f"/runs/compare?a={first.run_id}&b={second.run_id}")

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["same_seeds"] is True and body["seeds_note"]
    assert {row["metric"] for row in body["rows"]} >= {"success_rate", "episode_return", "steps"}
    assert client.get(f"/runs/compare?a={first.run_id}&b=run-20990101T000000Z-0000").status_code == 404


HEAVIER = {
    "op": "set_property",
    "object": "car",
    "component": "physics_body",
    "property": "mass",
    "value": {"type": "number", "value": 900},
}
GAIT = [
    {
        "area": "reward",
        "behavior": "The car circles without heading for the spot.",
        "change": "Pay less for time.",
        "try_id": "t1",
    },
    {
        "area": "body",
        "behavior": "It skids through every turn.",
        "change": "Make the car heavier so its wheels grip.",
        "try_id": "t2",
    },
]


@pytest.mark.needs_gl
def test_the_coach_watches_a_film_strip_and_points_each_finding_to_a_design_area_with_its_own_fix(
    app, client, monkeypatch, tmp_path
):
    folder = evaluated_run(app, client, steps=(0, 5_000))
    script(
        monkeypatch,
        tmp_path,
        coach=[
            {"match": ["diagnose"], **tool_step("film_strip")},
            tool_step("compare_strips", first=0),
            tool_step("try", operations=[TIME_PENALTY], look=None),
            tool_step("try", operations=[HEAVIER], look=None),
            tool_step("propose", try_id="t1", summary="Softer time penalty", explanation="Less pressure.", warnings=[]),
            findings(next_step="stop_and_fix", evidence=[], findings=GAIT),
            answering("It circles and skids; I propose two fixes."),
        ],
    )

    diagnosis = client.post(f"/runs/{folder.run_id}/diagnosis").json()

    reward, body = diagnosis["findings"]
    assert (reward["area"], body["area"]) == ("reward", "body")
    assert reward["proposal_id"] == diagnosis["proposal_id"]
    assert body["proposal_id"] not in (None, reward["proposal_id"])
    conversation = client.get(f"/projects/{diagnosis['project_id']}/conversation").json()
    message = conversation["messages"][-1]
    assert [step["ok"] for step in message["steps"]][:2] == [True, True]
    strip = message["film_strip"]
    assert strip["step"] == 5_000 and len(strip["frames"]) >= 20 and strip["interval"] > 0
    times = [frame["time"] for frame in strip["frames"]]
    assert times == sorted(times)
    assert client.get(f"/attachments/{strip['frames'][0]['attachment_id']}/content").status_code == 200
    assert message["findings"] == diagnosis["findings"]
    assert {proposal["id"] for proposal in conversation["proposals"]} >= {reward["proposal_id"], body["proposal_id"]}
    assert client.post(f"/proposals/{body['proposal_id']}/apply").status_code == 200


@pytest.mark.needs_gl
def test_a_strip_is_rendered_once_and_read_back_from_its_attachments(app, client):
    folder = evaluated_run(app, client)
    strips = FilmStrips(app.state.copilot.services.views, app.state.attachments)

    first = strips.strip(folder, 0)
    again = strips.strip(folder, 0)

    assert first is not None and again is not None and first.strip == again.strip
    assert again.sheet[:8] == b"\x89PNG\r\n\x1a\n"
    assert strips.strip(folder, 25_000) is None
