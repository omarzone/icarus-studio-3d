import json

import pytest

from icarus.contracts.behavior import ObjectShift
from icarus.contracts.training import StartRun
from icarus.copilot.agent.tools.base import ToolServices, TurnScope
from icarus.copilot.agent.tools.behavior_testing import BehaviorTestArgs, behavior_test
from icarus.projects.store import ProjectStore
from icarus.training.run_store import RunStore


@pytest.fixture
def scope(tmp_path) -> TurnScope:
    store = ProjectStore(tmp_path / "projects")
    project_id = store.create("Park", "parking_car").project.id
    services = ToolServices(store, RunStore(tmp_path / "runs"), None, None, None)  # type: ignore[arg-type]
    return TurnScope(project_id, store.state(project_id), "autopilot", services)


def test_the_copilot_adds_a_test_and_runs_it_on_two_checkpoints(scope):
    from stable_baselines3 import PPO

    from icarus.sim.env import ProjectEnv

    added = behavior_test(
        scope,
        BehaviorTestArgs(
            action="add", name="Start moved", start_count=2, shifts=[ObjectShift(object="spawn", dx=1, dy=0)]
        ),
    )
    assert added.ok, added.text
    assert json.loads(added.text)["id"] == "start-moved"
    start = StartRun(total_steps=10_000, copies=1)
    folder = scope.services.runs.folder(scope.services.runs.create(scope.state, start, threads=1).run_id)
    for step, seed in ((0, 0), (5_000, 1)):
        PPO("MlpPolicy", ProjectEnv(folder.project()), seed=seed, device="cpu").save(folder.checkpoint_path(step))

    ran = behavior_test(scope, BehaviorTestArgs(action="run", test="start-moved", step=5_000, compare_step=0))
    assert ran.ok and ran.run_facts, ran.text
    facts = json.loads(ran.text)
    assert facts["test"] == "Start moved" and facts["step"] == 5_000 and facts["compared"]["step"] == 0
    assert 0 <= facts["similarity"] <= 1
    assert len(facts["endings"]) == 2


def test_unknown_objects_and_runs_are_refused_in_words(scope):
    shift = [ObjectShift(object="moon", dx=1, dy=0)]
    refused = behavior_test(scope, BehaviorTestArgs(action="add", name="Moon moved", shifts=shift))
    assert not refused.ok and "moon" in refused.text
    assert not behavior_test(scope, BehaviorTestArgs(action="run")).ok
    listed = json.loads(behavior_test(scope, BehaviorTestArgs(action="list")).text)
    assert [test["id"] for test in listed] == ["standard-starts"]
