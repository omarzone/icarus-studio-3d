import pytest

from icarus.contracts.play import PlayReady, PushCommand, ResetCommand
from icarus.library.agents import agent_operations
from icarus.projects.agents import agent_project
from icarus.projects.operations import apply_operations
from icarus.sim.model_state import build_world
from icarus.sim.play_agents import AgentBrain, AgentsPlay
from icarus.sim.policy import RandomPolicy
from tests.sim.conftest import project_from


@pytest.fixture
def pair():
    walker = project_from("walker_robot")
    return apply_operations(walker, agent_operations(walker, "parking_car", "Car", (0.0, 5.0), (12.0, 5.0)))


def play_of(project) -> AgentsPlay:
    brains = []
    for index, agent in enumerate(project.agents):
        motors = build_world(agent_project(project, agent.id)).model.nu
        brains.append(AgentBrain(RandomPolicy(motors, seed=index, label=f"Random {agent.name}")))
    return AgentsPlay(project, 2, brains)


def test_every_agent_plays_its_own_brain_in_its_own_world_and_the_frame_shows_them_together(pair):
    play = play_of(pair)
    assert [len(session.world.project.bodies) for session in play.sessions] == [1, 1]
    info = play.info()
    assert [(item.agent, item.brain) for item in info.agents] == [
        ("walker_body", "Random Walker"),
        ("agent1", "Random Car"),
    ]
    assert [agent.id for agent in info.scene.agents] == ["walker_body", "agent1"]
    play.step_realtime(0.3)
    frame = play.frame()
    bodies = {geom.name: geom.body for geom in info.scene.geoms}
    moved = {bodies[geom.name] for geom in frame.geoms}
    for agent in info.scene.agents:
        assert set(agent.parts) & moved, agent.name
    assert [status.agent for status in frame.agents] == ["walker_body", "agent1"]
    assert frame.time == pytest.approx(0.3)


def test_a_push_moves_only_the_agent_it_names_and_reset_restarts_every_world(pair):
    play = play_of(pair)
    car, walker = play.sessions[1], play.sessions[0]
    root = car.world.agent_object
    assert root is not None
    replies = play.apply(PushCommand(tool="push", object=root, direction=(1.0, 0.0, 0.0), speed=2.0))
    assert replies and car.world.data.qvel[0] == pytest.approx(2.0, rel=0.3)
    assert abs(walker.world.data.qvel[0]) < 1e-9
    play.step_realtime(0.2)
    replies = play.apply(ResetCommand(tool="reset"))
    assert not any(isinstance(reply, PlayReady) and reply.session.agents == [] for reply in replies)
    assert [session.frame().time for session in play.sessions] == [0.0, 0.0]
