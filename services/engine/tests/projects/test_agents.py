import json

import pytest

from icarus.contracts.operations import DeleteObject, OperationBatch, RemoveAgent, SetAgent, SetBrain, SetRewardTerm
from icarus.contracts.project import Project
from icarus.contracts.specs import AgentSpec, RewardTermSpec
from icarus.design.checks import design_report
from icarus.design.compiler import compile_project
from icarus.library.agents import agent_operations
from icarus.library.templates import template_operations
from icarus.projects.agents import agent_project
from icarus.projects.operations import OperationError, apply_operations, empty_project
from icarus.projects.validation import validate_project
from tests.sim.conftest import project_from


@pytest.fixture
def walker() -> Project:
    return apply_operations(empty_project("0123456789ab", "Walker"), template_operations("walker_robot"))


@pytest.fixture
def pair(walker: Project) -> Project:
    """The walker and a humanoid in the lane beside it."""
    return apply_operations(walker, agent_operations(walker, "humanoid", "Humanoid", (0.0, 4.0), (10.0, 4.0)))


def test_a_stored_one_agent_document_loads_and_saves_the_same_fields(walker):
    stored = json.loads(walker.model_dump_json(exclude={"agents"}))
    loaded = Project.model_validate(stored)
    assert loaded.agents == []
    assert json.loads(loaded.model_dump_json(exclude={"agents"})) == stored
    assert Project.model_validate_json(loaded.model_dump_json()) == loaded


def test_a_project_with_agents_round_trips_through_its_document_and_batch(pair):
    assert Project.model_validate_json(pair.model_dump_json()) == pair
    batch = OperationBatch(operations=agent_operations(pair, "parking_car", "Car", (0, 8), (10, 8)), summary="Car")
    assert OperationBatch.model_validate_json(batch.model_dump_json()) == batch


def test_one_agent_projects_have_no_agents_and_edit_as_before(walker):
    term = RewardTermSpec(term="energy_cost", weight=-0.01)
    changed = apply_operations(walker, [SetRewardTerm(op="set_reward_term", term=term)])
    assert changed.agents == []
    assert next(item for item in changed.task.rewards if item.term == "energy_cost").weight == -0.01


def test_the_first_agent_added_makes_the_first_body_an_agent_that_keeps_the_project_task_and_brain(walker, pair):
    first, second = pair.agents
    assert (first.id, first.body, first.task, first.brain) == ("walker_body", "walker_body", None, None)
    assert second.body == "agent1_humanoid_body" and second.spawn == "agent1_spawn" and second.goal == "agent1_goal"
    assert agent_project(pair, first.id).task == walker.task
    assert validate_project(pair) == []


def test_each_agent_compiles_alone_without_the_other_bodies_or_lanes(pair):
    for agent, other in ((pair.agents[0], pair.agents[1]), (pair.agents[1], pair.agents[0])):
        alone = agent_project(pair, agent.id)
        assert [body.id for body in alone.bodies] == [agent.body] and alone.agents == []
        world = {obj.id for obj in alone.world.objects}
        assert other.spawn not in world and other.goal not in world
        model = compile_project(alone).model
        names = {model.body(index).name for index in range(model.nbody)}
        other_parts = {obj.id for body in pair.bodies if body.id == other.body for obj in body.objects}
        assert names.isdisjoint(other_parts)
        assert {obj.id for body in alone.bodies for obj in body.objects} <= names


def test_an_agent_scoped_change_touches_only_that_agent(pair):
    humanoid = pair.agents[1].id
    term = RewardTermSpec(term="energy_cost", weight=-0.02)
    changed = apply_operations(
        pair,
        [
            SetRewardTerm(op="set_reward_term", term=term, agent=humanoid),
            SetBrain(op="set_brain", seed=7, agent=humanoid),
        ],
    )
    assert changed.task == pair.task and changed.brain == pair.brain
    alone = agent_project(changed, humanoid)
    assert alone.brain.seed == 7
    assert next(item for item in alone.task.rewards if item.term == "energy_cost").weight == -0.02


def test_removing_the_added_agent_gives_back_the_one_agent_project(walker, pair):
    assert apply_operations(pair, [RemoveAgent(op="remove_agent", agent=pair.agents[1].id)]) == walker


def test_removing_the_first_agent_leaves_the_other_as_the_project_agent_with_its_own_task(pair):
    left = apply_operations(pair, [RemoveAgent(op="remove_agent", agent="walker_body")])
    assert left.agents == [] and [body.id for body in left.bodies] == ["agent1_humanoid_body"]
    assert left.task == pair.agents[1].task
    assert "agent1_spawn" in {obj.id for obj in left.world.objects}


def test_agents_that_name_missing_or_shared_bodies_or_wrong_lane_objects_are_rejected(pair):
    shared = AgentSpec(id="twin", name="Twin", body="walker_body")
    wrong_lane = pair.agents[1].model_copy(update={"spawn": "agent1_goal"})
    for agents, words in (
        ([*pair.agents, shared], "Two agents drive the body"),
        ([pair.agents[0], pair.agents[1].model_copy(update={"body": "ghost"})], "which is not a body"),
        ([pair.agents[0], wrong_lane], "has no spawn point"),
    ):
        issues = validate_project(pair.model_copy(update={"agents": agents}))
        assert any(words in issue.message for issue in issues), issues
    with pytest.raises(OperationError, match="no agent"):
        apply_operations(pair, [SetAgent(op="set_agent", agent="nobody", name="X")])


def test_deleting_a_lane_object_drops_it_from_its_agent(pair):
    lane = apply_operations(pair, [SetAgent(op="set_agent", agent="agent1", objects=["agent1_goal"])])
    gone = apply_operations(lane, [DeleteObject(op="delete_object", object="agent1_goal")])
    assert gone.agents[1].goal is None and gone.agents[1].objects == []


def test_the_lanes_race_template_has_a_tested_agent_with_its_scoreboard_in_every_lane():
    project = project_from("lanes_race")
    report, _ = design_report(project)
    assert report.ok, [check.detail for check in report.checks if check.status == "fail"]
    assert [agent.name for agent in project.agents] == ["Walker", "Humanoid", "Car", "Motorcycle"]
    families = [agent_project(project, agent.id).task.family for agent in project.agents]
    assert families == ["locomotion", "locomotion", "navigation", "navigation"]
    lanes = [agent_project(project, agent.id) for agent in project.agents]
    for agent, alone in zip(project.agents, lanes, strict=True):
        boards = {obj.id for obj in alone.world.objects if obj.id.endswith("board")}
        assert boards == {f"{agent.id}_board"}


def test_a_vault_body_joins_as_another_agent_in_its_own_lane(walker):
    spider = apply_operations(walker, agent_operations(walker, "spider", "Spider", (0.0, 4.0), (8.0, 4.0)))
    assert [agent.name for agent in spider.agents][-1] == "Spider"
    alone = agent_project(spider, spider.agents[-1].id)
    report, compiled = design_report(alone)
    assert compiled is not None and all(check.status != "fail" for check in report.checks)
