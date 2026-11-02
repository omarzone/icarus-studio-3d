from icarus.contracts.coach import AutopilotStart
from icarus.library.components import default_component
from icarus.training.progress_watch import WatchFinding
from tests.copilot.agent_script import answering, script, tool_step
from tests.copilot.test_autopilot import (
    LEARNED,
    STALLED,
    ScriptedTrainer,
    autopilot,
    coach_fixes,
    ended,
    project,
    texts,
    wait_for,
)
from tests.copilot.test_autopilot import (
    app as app,  # noqa: F401 - the fixture
)

BLOCKER = "The painted lines have colliders, so every episode touches them and fails."


class EarlyWatcher:
    """The coach as the loop sees it: it reports a design problem once a run has its first trained checkpoint."""

    def __init__(self, runs) -> None:
        self.runs = runs

    def blocker(self, run_id: str) -> WatchFinding | None:
        folder = self.runs.folder(run_id)
        evaluated = [point for point in folder.metrics() if point.kind == "eval"]
        if len(evaluated) >= 2 and folder.stored_status().name == "Run 1":
            return WatchFinding("design_blocker", BLOCKER)
        return None


def test_a_design_problem_found_early_stops_the_run_and_the_fix_trains_next_without_waiting_for_a_stall(
    app, monkeypatch, tmp_path
):
    coach_fixes(monkeypatch, tmp_path)
    project_id = project(app)
    # Run 1 has two evaluations of many and keeps training: only the coach's early look can stop it.
    trainer = ScriptedTrainer(app.state.runs, [[0.0, 0.0], LEARNED])
    pilot = autopilot(app, trainer)
    pilot.attach_watcher(EarlyWatcher(app.state.runs))

    pilot.start(project_id, AutopilotStart(mode="fix", goal_success=0.8))
    wait_for(ended(pilot, project_id))

    status = pilot.status(project_id)
    first, second = status.run_ids
    assert status.state == "done" and trainer.stopped[0] == first
    assert all(start.coach for start in trainer.started)
    assert any(BLOCKER in line.text for line in status.log)
    assert any("early look found a design problem" in text for text in texts(app, project_id))
    assert app.state.store.state(project_id).revision.number == 2
    assert app.state.runs.folder(second).config().revision_number == 2


def test_a_stalled_run_tries_more_steps_against_the_fix_on_one_seed_and_keeps_the_better(app, monkeypatch, tmp_path):
    coach_fixes(monkeypatch, tmp_path)
    project_id = project(app)
    more_steps, fixed = [0.1, 0.1, 0.1, 0.2], [0.1, 0.3, 0.5, 0.6]
    trainer = ScriptedTrainer(app.state.runs, [STALLED, more_steps, fixed, LEARNED])
    pilot = autopilot(app, trainer, trial_steps=100_000)

    pilot.start(project_id, AutopilotStart(mode="fix", goal_success=0.8))
    wait_for(ended(pilot, project_id))

    status = pilot.status(project_id)
    stalled, trial_a, trial_b, last = status.run_ids
    a, b = trainer.started[1], trainer.started[2]
    assert a.total_steps == b.total_steps == 100_000 and a.seed == b.seed and a.warm_start == b.warm_start
    assert a.warm_start is not None and a.warm_start.run_id == stalled
    assert app.state.runs.folder(trial_a).config().revision_number == 1
    assert app.state.runs.folder(trial_b).config().revision_number == 2
    said = "\n".join(texts(app, project_id))
    assert "Trial comparison on the same evaluation seeds" in said
    assert "| success_rate | 0.20 | 0.60 |" in said and "I keep the fix." in said
    assert status.state == "done" and app.state.store.state(project_id).revision.number == 2
    assert app.state.runs.folder(last).config().warm_start is not None


def test_when_more_steps_beat_the_fix_the_trial_restores_the_design_it_had(app, monkeypatch, tmp_path):
    coach_fixes(monkeypatch, tmp_path)
    project_id = project(app)
    trainer = ScriptedTrainer(app.state.runs, [STALLED, [0.1, 0.4, 0.5, 0.6], [0.1, 0.1, 0.1, 0.1], LEARNED])
    pilot = autopilot(app, trainer, trial_steps=100_000)

    pilot.start(project_id, AutopilotStart(mode="fix", goal_success=0.8))
    wait_for(ended(pilot, project_id))

    head = app.state.store.state(project_id)
    assert head.revision.number == 3 and head.revision.restored_from == 1
    assert "I keep more steps." in "\n".join(texts(app, project_id))


def test_a_fix_that_adds_a_sensor_is_trialled_with_both_designs_training_from_zero(app, monkeypatch, tmp_path):
    rear = default_component("distance_ray", "rear").model_dump(mode="json")
    sensor = {"op": "add_component", "object": "car", "component": rear}
    script(
        monkeypatch,
        tmp_path,
        coach=[
            {"match": ["diagnose"], **tool_step("try", operations=[sensor], look=None)},
            tool_step(
                "propose", try_id="t1", summary="A ray behind the car", explanation="It backs blind.", warnings=[]
            ),
            tool_step(
                "diagnosis",
                summary="The car backs into the wall it cannot see.",
                observations=["Success stays low."],
                evidence=[],
                hypothesis="Nothing senses what is behind the car.",
                next_step="stop_and_fix",
                findings=[{"area": "sensors", "behavior": "It reverses blind.", "change": "Add a rear ray."}],
            ),
            answering("I propose a rear ray."),
        ],
    )
    project_id = project(app)
    trainer = ScriptedTrainer(app.state.runs, [STALLED, [0.1, 0.1, 0.1, 0.2], [0.1, 0.3, 0.5, 0.6], LEARNED])
    pilot = autopilot(app, trainer, trial_steps=100_000)

    pilot.start(project_id, AutopilotStart(mode="fix", goal_success=0.8))
    wait_for(ended(pilot, project_id))

    a, b = trainer.started[1], trainer.started[2]
    assert a.warm_start is None and b.warm_start is None and a.seed == b.seed
    said = "\n".join(texts(app, project_id))
    assert "cannot continue with it" in said and "trains 100,000 steps from zero" in said
    assert "I keep the fix." in said
    assert app.state.store.state(project_id).revision.number == 2
