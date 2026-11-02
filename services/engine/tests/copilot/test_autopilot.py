import time
from collections.abc import Callable
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from icarus.api.app import create_app
from icarus.contracts.coach import AutopilotStart, AutopilotStatus
from icarus.contracts.project import ProjectState
from icarus.contracts.training import MetricPoint, RunStatus, StartRun, WarmStart
from icarus.copilot.autopilot import Autopilot, AutopilotBusy
from icarus.training.run_store import RunStore
from tests.copilot.agent_script import answering, script, tool_step

TIME_PENALTY = {"op": "set_reward_term", "term": {"term": "time_penalty", "weight": -0.02}}
STALLED = [0.0, 0.1, 0.1, 0.1, 0.1]
LEARNED = [0.9, 0.9, 0.9]


class ScriptedTrainer:
    """Starts runs the way the supervisor does, writing each run's evaluations at once from a script of success
    rates instead of training; a run with fewer evaluations than checkpoints keeps training until stopped."""

    def __init__(self, store: RunStore, scripts: list[list[float]], returns: list[float] | None = None) -> None:
        self.store = store
        self.scripts = scripts
        # One return per run for every checkpoint; by default ten times the success rate.
        self.returns = returns
        self.started: list[StartRun] = []
        self.stopped: list[str] = []

    def start(self, state: ProjectState, start: StartRun, threads: int, use_graphics_card: bool) -> RunStatus:
        status = self.store.create(state, start, threads)
        folder = self.store.folder(status.run_id)
        steps = folder.config().checkpoint_steps
        successes = self.scripts[len(self.started)]
        fixed_return = self.returns[len(self.started)] if self.returns else None
        self.started.append(start)
        for step, success in zip(steps, successes, strict=False):
            folder.checkpoint_path(step).write_bytes(b"brain")
            folder.append_metric(
                MetricPoint(
                    kind="eval",
                    step=step,
                    elapsed=1.0,
                    episode_return=10 * success if fixed_return is None else fixed_return,
                    episode_length=200,
                    success_rate=success,
                    reward_terms={},
                )
            )
        finished = len(successes) >= len(steps)
        update = {"state": "done" if finished else "running", "step": steps[len(successes) - 1]}
        folder.write_status(folder.stored_status().model_copy(update=update | {"finished_at": datetime.now(UTC)}))
        return status

    def stop(self, run_id: str) -> RunStatus:
        self.stopped.append(run_id)
        folder = self.store.folder(run_id)
        if folder.stored_status().state == "running":
            folder.write_status(folder.stored_status().model_copy(update={"state": "stopped"}))
        return folder.status()


def wait_for(condition: Callable[[], bool], timeout: float = 30.0) -> None:
    deadline = time.monotonic() + timeout
    while not condition():
        assert time.monotonic() < deadline, "Timed out"
        time.sleep(0.02)


@pytest.fixture
def app(tmp_path):
    return create_app(tmp_path / "projects", tmp_path / "runs", tmp_path / "settings")


def project(app) -> str:
    client = TestClient(app)
    return client.post("/projects", json={"name": "Parking", "template": "parking_car"}).json()["project"]["id"]


def autopilot(app, trainer: ScriptedTrainer, trial_steps: int | None = None) -> Autopilot:
    pilot = Autopilot(
        app.state.store,
        app.state.runs,
        trainer,
        app.state.training_settings,
        app.state.copilot,
        app.state.coach,
        app.state.store.root / ".copilot",
        poll_seconds=0.01,
        trial_steps=trial_steps,
    )
    app.state.autopilot = pilot
    return pilot


def coach_fixes(monkeypatch, tmp_path) -> None:
    script(
        monkeypatch,
        tmp_path,
        coach=[
            {"match": ["diagnose"], **tool_step("try", operations=[TIME_PENALTY], look=None)},
            tool_step("propose", try_id="t1", summary="Softer time penalty", explanation="Less pressure.", warnings=[]),
            tool_step(
                "diagnosis",
                summary="The car stopped improving.",
                observations=["Success stays low."],
                evidence=[],
                hypothesis="The time penalty pushes it to rush.",
                next_step="stop_and_fix",
            ),
            answering("I propose a softer time penalty."),
        ],
    )


def ended(pilot: Autopilot, project_id: str) -> Callable[[], bool]:
    return lambda: pilot.status(project_id).state in ("done", "stopped", "failed")


def texts(app, project_id: str) -> list[str]:
    return [message.text for message in app.state.copilot.conversation(project_id).messages]


def test_fix_mode_stops_a_stalled_run_applies_the_fix_and_continues_warm_until_the_goal_holds(
    app, monkeypatch, tmp_path
):
    coach_fixes(monkeypatch, tmp_path)
    project_id = project(app)
    trainer = ScriptedTrainer(app.state.runs, [STALLED, LEARNED])
    pilot = autopilot(app, trainer)

    pilot.start(project_id, AutopilotStart(mode="fix", goal_success=0.8))
    wait_for(ended(pilot, project_id))

    status = pilot.status(project_id)
    assert status.state == "done" and status.iteration == 2 and len(status.run_ids) == 2
    first, second = status.run_ids
    assert trainer.stopped == [first, second]
    assert trainer.started[0].warm_start is None
    assert trainer.started[1].warm_start == WarmStart(run_id=first, step=25_000)
    assert status.best_run_id == second and status.best_success == pytest.approx(0.9)
    assert len(status.diagnosis_ids) == 1 and status.finished_at is not None
    head = app.state.store.state(project_id)
    assert head.revision.number == 2 and head.revision.author == "copilot"
    assert app.state.runs.folder(second).config().revision_number == 2
    said = texts(app, project_id)
    assert said[0].startswith("Autopilot on") and any("Softer time penalty" in text for text in said)
    assert any(text.startswith("Done:") for text in said)
    assert any("stopped improving" in line.text.lower() or "not improved" in line.text for line in status.log)


def test_ask_mode_waits_for_the_person_to_apply_the_fix(app, monkeypatch, tmp_path):
    coach_fixes(monkeypatch, tmp_path)
    project_id = project(app)
    pilot = autopilot(app, ScriptedTrainer(app.state.runs, [STALLED, LEARNED]))

    pilot.start(project_id, AutopilotStart(mode="ask"))
    wait_for(lambda: pilot.status(project_id).state == "waiting_approval")

    assert app.state.store.state(project_id).revision.number == 1
    proposal = app.state.copilot.conversation(project_id).proposals[-1]
    app.state.copilot.apply(proposal.id)
    wait_for(ended(pilot, project_id))
    assert pilot.status(project_id).state == "done" and len(pilot.status(project_id).run_ids) == 2


def test_ask_mode_stops_when_the_fix_is_discarded(app, monkeypatch, tmp_path):
    coach_fixes(monkeypatch, tmp_path)
    project_id = project(app)
    pilot = autopilot(app, ScriptedTrainer(app.state.runs, [STALLED, LEARNED]))

    pilot.start(project_id, AutopilotStart(mode="ask"))
    wait_for(lambda: pilot.status(project_id).state == "waiting_approval")
    app.state.copilot.discard(app.state.copilot.conversation(project_id).proposals[-1].id)
    wait_for(ended(pilot, project_id))

    status = pilot.status(project_id)
    assert status.state == "stopped" and len(status.run_ids) == 1
    assert texts(app, project_id)[-1] == "The proposal was not applied, so the autopilot stopped."


def test_the_budget_ends_the_loop_with_the_best_brain_and_no_diagnosis_after_the_last_run(app):
    project_id = project(app)
    pilot = autopilot(app, ScriptedTrainer(app.state.runs, [[0.0, 0.2, 0.3, 0.4, 0.5, 0.6]]))

    pilot.start(project_id, AutopilotStart(mode="fix", max_iterations=1))
    wait_for(ended(pilot, project_id))

    status = pilot.status(project_id)
    assert status.state == "done" and status.diagnosis_ids == []
    assert status.best_success == pytest.approx(0.6)
    assert "used its budget" in texts(app, project_id)[-1]


def test_stopping_the_autopilot_stops_its_run(app):
    project_id = project(app)
    trainer = ScriptedTrainer(app.state.runs, [[0.0]])
    pilot = autopilot(app, trainer)
    pilot.start(project_id, AutopilotStart(mode="fix"))
    wait_for(lambda: len(pilot.status(project_id).run_ids) == 1)

    with pytest.raises(AutopilotBusy):
        pilot.start(project_id, AutopilotStart(mode="fix"))
    stopped = pilot.stop(project_id)

    assert stopped.state == "stopped"
    assert trainer.stopped and app.state.runs.folder(stopped.run_ids[0]).status().state == "stopped"


def test_an_autopilot_left_running_by_a_closed_engine_reads_back_as_stopped(app, tmp_path):
    project_id = project(app)
    path = app.state.store.root / ".copilot" / f"{project_id}.autopilot.json"
    status = AutopilotStatus(
        project_id=project_id,
        mode="fix",
        state="running",
        iteration=1,
        max_iterations=4,
        goal_success=0.8,
        started_at=datetime.now(UTC),
        run_ids=[],
        diagnosis_ids=[],
        log=[],
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(status.model_dump_json(), encoding="utf-8")

    restarted = create_app(tmp_path / "projects", tmp_path / "runs", tmp_path / "settings")

    assert restarted.state.autopilot.status(project_id).state == "stopped"


def test_the_autopilot_routes(app):
    client = TestClient(app)
    project_id = project(app)
    assert client.get(f"/projects/{project_id}/autopilot").status_code == 404
    autopilot(app, ScriptedTrainer(app.state.runs, [[0.0]]))

    started = client.post(f"/projects/{project_id}/autopilot", json={"mode": "fix", "max_minutes": 5})
    assert started.status_code == 201
    body = started.json()
    assert (body["mode"], body["state"], body["goal_success"], body["max_iterations"]) == ("fix", "running", 0.8, 4)
    again = client.post(f"/projects/{project_id}/autopilot", json={"mode": "fix"})
    assert again.status_code == 409 and again.json()["code"] == "conflict"
    assert client.get(f"/projects/{project_id}/autopilot").json()["project_id"] == project_id
    stopped = client.delete(f"/projects/{project_id}/autopilot")
    assert stopped.status_code == 200 and stopped.json()["state"] == "stopped"


def test_the_chat_starts_and_stops_the_autopilot_through_the_coach_tool(app, monkeypatch, tmp_path):
    from icarus.copilot.agent.tools.coaching import Coaching

    project_id = project(app)
    pilot = autopilot(app, ScriptedTrainer(app.state.runs, [[0.0]]))
    app.state.copilot.attach_coaching(Coaching(app.state.coach, pilot))
    start = tool_step("coach", action="start_autopilot", mode="fix", goal_success=0.9)
    stop = tool_step("coach", action="stop_autopilot")
    script(
        monkeypatch,
        tmp_path,
        start=[{"match": ["autopilot on"], **start}, answering("It is on.")],
        stop=[{"match": ["autopilot off"], **stop}, answering("It is off.")],
    )
    client = TestClient(app)

    on = client.post(f"/projects/{project_id}/conversation/messages", json={"text": "autopilot on, fix it yourself"})

    assert on.status_code == 200
    assert pilot.status(project_id).mode == "fix" and pilot.status(project_id).goal_success == 0.9
    assert [step["tool"] for step in on.json()["messages"][-1]["steps"]] == ["train"]
    client.post(f"/projects/{project_id}/conversation/messages", json={"text": "autopilot off"})
    assert pilot.status(project_id).state == "stopped"


def test_the_chat_asks_the_coach_for_a_diagnosis_that_arrives_in_the_conversation(app, monkeypatch, tmp_path):
    from tests.api.test_coach_api import evaluated_run, findings

    folder = evaluated_run(app, TestClient(app))
    project_id = folder.stored_status().project_id
    script(
        monkeypatch,
        tmp_path,
        chat=[{"match": ["not learning"], **tool_step("coach", action="diagnose")}, answering("Let me check.")],
        coach=[{"match": ["diagnose"], **findings(evidence=[])}, answering("The coach's view.")],
    )

    reply = TestClient(app).post(
        f"/projects/{project_id}/conversation/messages", json={"text": "why is it not learning?"}
    )

    assert "The coach is diagnosing Run 1" in reply.json()["messages"][-1]["text"]
    wait_for(lambda: bool(app.state.coach.diagnoses(folder.run_id)))
    wait_for(lambda: texts(app, project_id)[-1] == "The coach's view.")


def test_at_equal_success_the_best_brain_is_the_newer_design_whatever_its_return(app, monkeypatch, tmp_path):
    coach_fixes(monkeypatch, tmp_path)
    project_id = project(app)
    # Returns of different reward designs do not compare: the fix changed the weights.
    trainer = ScriptedTrainer(app.state.runs, [[0.0] * 5, [0.0] * 6], returns=[5.0, 1.0])
    pilot = autopilot(app, trainer)

    pilot.start(project_id, AutopilotStart(mode="fix", max_iterations=2))
    wait_for(ended(pilot, project_id))

    status = pilot.status(project_id)
    assert len(status.run_ids) == 2 and status.best_run_id == status.run_ids[1]
