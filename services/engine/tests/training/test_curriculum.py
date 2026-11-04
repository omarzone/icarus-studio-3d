from icarus.contracts.operations import SetCurriculum, SetEpisode, SetProperty
from icarus.contracts.project import ProjectState
from icarus.contracts.properties import ChoiceValue, NumberValue, SwitchValue
from icarus.contracts.specs import CurriculumStage, TaskSpec
from icarus.contracts.training import StartRun
from icarus.projects.document import all_objects
from icarus.projects.operations import apply_operations
from icarus.sim.env import ProjectEnv
from icarus.training.curriculum import StagePromotion
from icarus.training.run_store import RunStore
from icarus.training.worker import train
from tests.training.conftest import quick

STAGES = [
    CurriculumStage.model_validate(
        {"name": "Wide", "settings": [{"parameter": "episode_seconds", "value": 6}], "promote": {"episodes": 1}}
    ),
    CurriculumStage.model_validate({"name": "Long", "settings": [{"parameter": "episode_seconds", "value": 12}]}),
]


def _parked_from_the_start(state: ProjectState) -> ProjectState:
    """The parking car with a goal so wide and lax that every try succeeds on its first step."""
    project = state.project
    goal = next(obj for obj in all_objects(project) if any(c.kind == "goal_zone" for c in obj.components))
    component = next(c for c in goal.components if c.kind == "goal_zone")
    values = {
        "shape": ChoiceValue(type="choice", value="circle"),
        "radius": NumberValue(type="number", value=20),
        "fully_inside": SwitchValue(type="switch", value=False),
        "align_within": NumberValue(type="number", value=180),
        "stop_speed": NumberValue(type="number", value=5),
    }
    operations = [
        SetProperty(op="set_property", object=goal.id, component=component.id, property=prop, value=value)
        for prop, value in values.items()
    ]
    operations += [
        SetEpisode(op="set_episode", end_on_success=True),
        SetCurriculum(op="set_curriculum", stages=STAGES),
    ]
    return state.model_copy(update={"project": apply_operations(project, operations)})


def test_promotion_waits_for_the_window_and_its_success_rate():
    stages = [
        CurriculumStage.model_validate({"name": "A", "promote": {"episodes": 4, "success_rate": 0.75}}),
        CurriculumStage.model_validate({"name": "B"}),
    ]
    promotion = StagePromotion(TaskSpec(family="navigation", rewards=[], curriculum=stages))
    # Three tries are too few, and four at 50% too weak; the window then slides to the latest four.
    assert [promotion.add(success) for success in (False, False, True, True)] == [None] * 4
    assert promotion.stage == 0
    assert promotion.add(True) == 0.75 and promotion.stage == 1
    # The last stage is where training stays.
    assert promotion.add(True) is None and promotion.stage == 1
    assert not StagePromotion(TaskSpec(family="navigation", rewards=[])).active


def test_a_copy_moves_to_the_next_stage_from_its_next_try(parking_state):
    env = ProjectEnv(_parked_from_the_start(parking_state).project, randomize=True)
    env.reset(seed=0)
    assert env._seconds == 6
    *_, terminated, _, info = env.step(env.action_space.sample() * 0)
    assert terminated and info["is_success"] and info["stage"] == 0
    env.set_stage(1)
    assert env.stage == 0
    env.reset(seed=0)
    assert (env.stage, env._seconds) == (1, 12)
    *_, info = env.step(env.action_space.sample() * 0)
    assert info["stage"] == 1


def test_training_advances_a_stage_after_its_successes_and_records_it(tmp_path, parking_state, monkeypatch):
    from icarus.training.callback import TrainingCallback

    store = RunStore(tmp_path)
    state = quick(_parked_from_the_start(parking_state))
    status = store.create(state, StartRun(total_steps=10_000, copies=1, seed=3), threads=1, evaluation_episodes=1)
    assert (status.stages, status.stage) == (["Wide", "Long"], 0)
    folder = store.folder(status.run_id)
    # The first practice step ends a successful try, which passes the first stage; then the run stops.
    monkeypatch.setattr(TrainingCallback, "_on_training_start", lambda callback: folder.request_stop())

    assert train(folder.path) == "stopped"

    final = folder.status()
    assert final.stage == 1
    assert any(line.text.startswith("Stage 2 of 2, Long, from step 1:") for line in folder.log())
    evaluations = [point for point in folder.metrics() if point.kind == "eval"]
    assert [point.stage for point in evaluations] == [0, 1]
    first, last = folder.episodes(0), folder.episodes(final.step)
    assert first is not None and last is not None
    assert (first.episode_seconds, last.episode_seconds) == (6, 12)
