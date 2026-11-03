import time
from datetime import UTC, datetime

import pytest

from icarus.contracts.project import ProjectState, Revision
from icarus.contracts.training import StartRun, WarmStart
from icarus.design.checks import design_report
from icarus.library.agents import agent_operations
from icarus.projects.agents import agent_project
from icarus.projects.operations import apply_operations
from icarus.training.run_store import RunStore
from icarus.training.supervisor import RunInProgress, Supervisor, WarmStartRefused
from tests.sim.conftest import project_from
from tests.training.test_supervisor import fake, state_is, wait_for

START = StartRun(total_steps=10_000, copies=4)


@pytest.fixture
def pair_state() -> ProjectState:
    walker = project_from("walker_robot")
    project = apply_operations(walker, agent_operations(walker, "parking_car", "Car", (0.0, 5.0), (12.0, 5.0)))
    report, _ = design_report(project)
    revision = Revision(
        number=3, parent=2, author="user", summary="Car", operations=[], created_at=datetime(2026, 1, 1, tzinfo=UTC)
    )
    return ProjectState(project=project, revision=revision, report=report, can_undo=True, can_redo=False)


def test_a_group_starts_one_run_per_agent_each_frozen_with_only_its_own_body(tmp_path, pair_state):
    store = RunStore(tmp_path)
    supervisor = Supervisor(store, command=fake("obey"))
    group = supervisor.start_group(pair_state, START, threads=4, use_graphics_card=False)
    try:
        assert [run.agent for run in group.runs] == ["walker_body", "agent1"]
        assert [run.name for run in group.runs] == ["Run 1 · Walker", "Run 1 · Car"]
        assert {run.group for run in group.runs} == {group.group_id}
        for run, agent in zip(group.runs, pair_state.project.agents, strict=True):
            folder = store.folder(run.run_id)
            config = folder.config()
            assert (config.agent, config.group, config.revision_number) == (agent.id, group.group_id, 3)
            assert (config.copies, config.threads) == (2, 2)
            assert folder.project() == agent_project(pair_state.project, agent.id)
        assert store.group(group.group_id).runs == group.runs
        assert sorted(supervisor.active_runs()) == sorted(run.run_id for run in group.runs)
        for run in group.runs:
            wait_for(state_is(store, run.run_id, "running"))
        with pytest.raises(RunInProgress):
            supervisor.start_group(pair_state, START, threads=4, use_graphics_card=False)
    finally:
        supervisor.stop(group.runs[1].run_id)
    for run in group.runs:
        wait_for(state_is(store, run.run_id, "stopped"))
    wait_for(lambda: supervisor.active_runs() == [])


def test_starting_a_project_with_agents_starts_its_group_and_the_next_start_counts_it_as_one_run(tmp_path, pair_state):
    store = RunStore(tmp_path)
    supervisor = Supervisor(store, command=fake("obey"))
    lead = supervisor.start(pair_state, START, threads=1, use_graphics_card=False)
    assert lead.group is not None and lead.agent == "walker_body"
    assert len(store.group(lead.group).runs) == 2 and all(run.copies == 2 for run in store.group(lead.group).runs)
    stopped = supervisor.stop_group(lead.group)
    assert {run.state for run in stopped.runs} <= {"stopping", "stopped"}
    for run in stopped.runs:
        wait_for(state_is(store, run.run_id, "stopped"))
    wait_for(lambda: supervisor.active_runs() == [])
    assert store.next_run_name(pair_state.project.id) == "Run 2"


def test_a_group_refuses_to_continue_from_one_brain(tmp_path, pair_state):
    supervisor = Supervisor(RunStore(tmp_path), command=fake("obey"))
    start = START.model_copy(update={"warm_start": WarmStart(run_id="run-20260101T000000Z-abcd", step=0)})
    with pytest.raises(WarmStartRefused):
        supervisor.start_group(pair_state, start, threads=2, use_graphics_card=False)
    assert supervisor.active_runs() == []


@pytest.mark.slow
def test_a_walker_and_a_car_really_train_together_each_in_its_own_world(tmp_path, pair_state):
    store = RunStore(tmp_path)
    supervisor = Supervisor(store)
    started = time.monotonic()
    group = supervisor.start_group(
        pair_state, StartRun(total_steps=10_000, copies=2), threads=2, use_graphics_card=False
    )
    for run in group.runs:
        wait_for(state_is(store, run.run_id, "done", "failed", "stopped"), timeout=900)
    print(f"Two agents, 10k steps each, took {time.monotonic() - started:.1f} s")
    for run in group.runs:
        folder = store.folder(run.run_id)
        final = folder.status()
        assert final.state == "done" and final.step >= 10_000, final.failure
        assert [checkpoint.step for checkpoint in folder.checkpoints()] == [0, 10_000]
        rollout = folder.rollout(10_000)
        parts = {obj.id for body in folder.project().bodies for obj in body.objects}
        assert rollout is not None and rollout.frames
        snapshot = folder.snapshot()
        assert snapshot is not None and len(snapshot.copies) == 1
        drawn = {geom.split(":")[0] for geom in rollout.geoms}
        assert parts & drawn
    walker, car = (store.folder(run.run_id).project() for run in group.runs)
    assert walker.task.family == "locomotion" and car.task.family == "navigation"


def test_an_agent_s_latest_run_comes_only_from_its_own_runs(tmp_path, pair_state):
    store = RunStore(tmp_path)
    supervisor = Supervisor(store, command=fake("obey"))
    group = supervisor.start_group(pair_state, START, threads=2, use_graphics_card=False)
    supervisor.stop_group(group.group_id)
    for run in group.runs:
        wait_for(state_is(store, run.run_id, "stopped"))
    wait_for(lambda: supervisor.active_runs() == [])
    project = pair_state.project
    car = agent_project(project, "agent1")
    ended = store.latest_ended(project.id, 3, car, "agent1")
    assert ended is not None and ended.run_id == group.runs[1].run_id
    assert store.latest_ended(project.id, 3, project) is None
