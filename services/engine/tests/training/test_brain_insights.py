from datetime import timedelta
from pathlib import Path

from icarus.contracts.project import ProjectState
from icarus.contracts.training import MetricPoint, StartRun
from icarus.training.brain_insights import behaviors, sizes, sources
from icarus.training.run_store import RunStore
from tests.training.conftest import state_of
from tests.training.test_failure_groups import parking, record

START = StartRun(total_steps=10_000, copies=1)


def test_behaviors_count_how_the_evaluation_episodes_ended_and_when():
    episodes = parking(
        record(0, success=True, seconds=12.0, end_distance=0.2),
        record(1, success=True, seconds=14.0, end_distance=0.1),
        record(2, touched="Wall", touched_at=4.0, end_distance=6.0),
    )
    found = behaviors("run-1", episodes)
    assert [(item.id, item.episodes, item.of, item.seconds) for item in found.behaviors] == [
        ("reached_goal", 2, 3, 13.0),
        ("touched_obstacle", 1, 3, 4.0),
    ]
    assert found.behaviors[1].name == "Touched Wall"


def _ended(store: RunStore, state: ProjectState, success: float, minutes: float) -> str:
    """A finished run with a saved best brain at step 5,000 that reached `success` there."""
    status = store.create(state, START, threads=1)
    folder = store.folder(status.run_id)
    folder.checkpoint_path(5_000).write_bytes(b"saved")
    folder.append_metric(
        MetricPoint(
            kind="eval",
            step=5_000,
            elapsed=1,
            episode_return=1,
            episode_length=10,
            success_rate=success,
            reward_terms={},
        )
    )
    finished = status.started_at + timedelta(minutes=minutes)
    folder.write_status(
        status.model_copy(update={"state": "done", "best_step": 5_000, "step": 10_000, "finished_at": finished})
    )
    return status.run_id


def _sized(state: ProjectState, layers: list[int]) -> ProjectState:
    brain = state.project.brain.model_copy(update={"layers": layers})
    return state.model_copy(update={"project": state.project.model_copy(update={"brain": brain})})


def test_sizes_show_what_runs_of_the_project_measured_and_recommend_the_best(tmp_path: Path):
    store = RunStore(tmp_path)
    state = state_of("parking_car")
    small = _ended(store, _sized(state, [64, 64]), success=0.8, minutes=12)
    _ended(store, state, success=0.5, minutes=40)
    found = {option.id: option for option in sizes(store, state.project).sizes}
    assert found["small"].trained is not None and found["small"].trained.run_id == small
    assert (found["small"].trained.minutes, found["small"].trained.success_rate) == (12.0, 0.8)
    assert found["small"].recommended and not found["medium"].recommended
    assert found["medium"].current and found["large"].trained is None


def test_sources_list_brains_of_every_project_and_say_which_fit(tmp_path: Path):
    store = RunStore(tmp_path)
    car = state_of("parking_car")
    other_car = state_of("parking_car", project_id="ba9876543210")
    walker = state_of("walker_robot", project_id="cdef01234567")
    fits = _ended(store, other_car, success=0.7, minutes=5)
    _ended(store, walker, success=0.2, minutes=5)
    _ended(store, _sized(car, [64, 64]), success=0.9, minutes=5)
    names = {"ba9876543210": "Other car", "cdef01234567": "Walker", car.project.id: "Car"}
    found = sources(store, car.project, names.__getitem__)
    assert found.options[0].run_id == fits and found.options[0].fits
    assert found.options[0].project_name == "Other car" and found.options[0].success_rate == 0.7
    misfits = {option.project_name: option.reason for option in found.options if not option.fits}
    assert "senses" in (misfits["Walker"] or "")
    assert "64 and 64" in (misfits["Car"] or "")
