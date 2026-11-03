"""Projects with several agents: each learner is a body with its own task, brain and lane, and trains alone.

`agent_project` is the one place that turns a project with several agents into the one-agent project each agent
trains, plays and is tested with: the whole world without the other agents' bodies and lanes, its body first and its
own task and brain. Everything downstream (compiler, environment, worker, Play) keeps working on one agent."""

from icarus.contracts.errors import ValidationIssue
from icarus.contracts.objects import ObjectSpec
from icarus.contracts.project import Project
from icarus.contracts.specs import AgentSpec, BrainSpec, TaskSpec


class UnknownAgent(LookupError):
    pass


def find_agent(project: Project, agent_id: str) -> AgentSpec:
    agent = next((item for item in project.agents if item.id == agent_id), None)
    if agent is None:
        raise UnknownAgent(agent_id)
    return agent


def agent_task(project: Project, agent: AgentSpec) -> TaskSpec:
    return agent.task if agent.task is not None else project.task


def agent_brain(project: Project, agent: AgentSpec) -> BrainSpec:
    return agent.brain if agent.brain is not None else project.brain


def lane_objects(agent: AgentSpec) -> set[str]:
    """World objects only this agent sees."""
    return {*agent.objects, *(item for item in (agent.spawn, agent.goal) if item)}


def with_children(objects: list[ObjectSpec], roots: set[str]) -> set[str]:
    removed = set(roots)
    grew = True
    while grew:
        grew = False
        for obj in objects:
            if obj.parent in removed and obj.id not in removed:
                removed.add(obj.id)
                grew = True
    return removed


def agent_project(project: Project, agent_id: str) -> Project:
    """The one-agent project this agent trains, plays and is tested with; the other agents are absent."""
    agent = find_agent(project, agent_id)
    others = [item for item in project.agents if item.id != agent_id]
    shared = set().union(*(lane_objects(item) for item in others)) - lane_objects(agent)
    hidden = with_children(project.world.objects, shared)
    other_bodies = {item.body for item in others}
    own = [body for body in project.bodies if body.id == agent.body]
    props = [body for body in project.bodies if body.id != agent.body and body.id not in other_bodies]
    world = project.world.model_copy(
        update={"objects": [obj for obj in project.world.objects if obj.id not in hidden]}, deep=True
    )
    return project.model_copy(
        update={
            "world": world,
            "bodies": [body.model_copy(deep=True) for body in [*own, *props]],
            "task": agent_task(project, agent).model_copy(deep=True),
            "brain": agent_brain(project, agent).model_copy(deep=True),
            "agents": [],
        }
    )


def agent_issues(project: Project) -> list[ValidationIssue]:
    """Agents name distinct existing bodies and world objects; a spawn and a goal carry their component."""
    issues: list[ValidationIssue] = []
    bodies = {body.id for body in project.bodies}
    world = {obj.id: obj for obj in project.world.objects}
    seen_ids: set[str] = set()
    seen_bodies: set[str] = set()
    for agent in project.agents:
        path = f"agents.{agent.id}"
        if agent.id in seen_ids:
            issues.append(ValidationIssue(path=path, message=f"Two agents share the id {agent.id!r}"))
        seen_ids.add(agent.id)
        if agent.body not in bodies:
            message = f"{agent.name} drives {agent.body!r}, which is not a body"
            issues.append(ValidationIssue(path=f"{path}.body", message=message))
        elif agent.body in seen_bodies:
            issues.append(ValidationIssue(path=f"{path}.body", message=f"Two agents drive the body {agent.body!r}"))
        seen_bodies.add(agent.body)
        for field, kind in (("spawn", "spawn_point"), ("goal", "goal_zone")):
            target = getattr(agent, field)
            if target is None:
                continue
            obj = world.get(target)
            if obj is None:
                message = f"{agent.name}'s {field} is {target!r}, which is not a world object"
                issues.append(ValidationIssue(path=f"{path}.{field}", message=message))
            elif not any(item.kind == kind for item in obj.components):
                message = f"{agent.name}'s {field} {obj.name} has no {kind.replace('_', ' ')}"
                issues.append(ValidationIssue(path=f"{path}.{field}", message=message))
        for target in agent.objects:
            if target not in world:
                message = f"{agent.name}'s lane names {target!r}, which is not a world object"
                issues.append(ValidationIssue(path=f"{path}.objects", message=message))
    if len(project.agents) == 1:
        issues.append(ValidationIssue(path="agents", message="A project with one agent lists none"))
    return issues


def without_objects(agent: AgentSpec, removed: set[str]) -> AgentSpec:
    """The agent with references to removed world objects dropped."""
    return agent.model_copy(
        update={
            "spawn": None if agent.spawn in removed else agent.spawn,
            "goal": None if agent.goal in removed else agent.goal,
            "objects": [item for item in agent.objects if item not in removed],
        }
    )


def collapse_single(project: Project) -> None:
    """A project left with one agent is a one-agent project again: its body first, its task and brain the project's."""
    if len(project.agents) != 1:
        return
    agent = project.agents[0]
    project.task = agent_task(project, agent)
    project.brain = agent_brain(project, agent)
    project.bodies = sorted(project.bodies, key=lambda body: body.id != agent.body)
    project.agents = []
