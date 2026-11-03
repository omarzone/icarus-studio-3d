"""Library bodies as agents: a ready-made body placed in its own lane, with a spawn point, a goal and its task."""

import math
from dataclasses import dataclass

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.operations import AddAgent, CreateObject, EditOperation
from icarus.contracts.project import Project
from icarus.contracts.properties import AssetValue, VectorValue
from icarus.contracts.specs import AgentSpec, BodySpec, RewardTermSpec, TaskFamily, TaskSpec
from icarus.library.parts import Part
from icarus.library.rewards import REWARD_TERMS
from icarus.library.templates import template_bodies
from icarus.projects.document import all_objects

Point = tuple[float, float]


class UnknownBody(KeyError):
    pass


@dataclass(frozen=True)
class LibraryBody:
    id: str
    name: str
    family: TaskFamily
    rewards: list[str]


def library_bodies() -> dict[str, LibraryBody]:
    """Bodies an agent can be made of, by library id."""
    return {key: LibraryBody(key, body.name, body.family, body.rewards) for key, body in template_bodies().items()}


def _prefixed(obj: ObjectSpec, prefix: str, ids: set[str], at: Point) -> ObjectSpec:
    obj = obj.model_copy(deep=True)
    obj.id = f"{prefix}{obj.id}"
    obj.parent = f"{prefix}{obj.parent}" if obj.parent else None
    for component in obj.components:
        for key, value in component.properties.items():
            if isinstance(value, AssetValue) and value.value in ids:
                component.properties[key] = value.model_copy(update={"value": f"{prefix}{value.value}"})
        if obj.parent is None and component.kind == "transform":
            position = component.properties.get("position")
            x, y, z = position.value if isinstance(position, VectorValue) else (0.0, 0.0, 0.0)
            component.properties["position"] = VectorValue(type="vector", value=(x + at[0], y + at[1], z))
    return obj


def library_body(body_id: str, prefix: str = "", at: Point = (0.0, 0.0)) -> BodySpec:
    """A library body with every object id prefixed (references too), its root moved by `at` on the ground."""
    body = template_bodies().get(body_id)
    if body is None:
        raise UnknownBody(body_id)
    # A template's goal travels with its body; an agent gets its own in its lane.
    specs = [part.spec() for part in body.parts if not {"goal_zone", "spawn_point"} & set(part.components)]
    ids = {obj.id for obj in specs}
    objects = [_prefixed(obj, prefix, ids, at) for obj in specs]
    return BodySpec(id=f"{prefix}{body.id}", name=body.name, objects=objects)


def free_prefix(project: Project, base: str) -> str:
    """A prefix no object, body or agent id of the project starts with."""
    taken = {obj.id for obj in all_objects(project)} | {body.id for body in project.bodies}
    taken |= {agent.id for agent in project.agents}
    index = 1
    while True:
        prefix = f"{base}{index}_"
        if not any(item.startswith(prefix) or item == prefix[:-1] for item in taken):
            return prefix
        index += 1


def agent_operations(
    project: Project,
    body_id: str,
    name: str,
    start: Point,
    goal: Point,
    goal_radius: float = 1.0,
    prefix: str | None = None,
) -> list[EditOperation]:
    """Add a library body as an agent standing at `start`, with its own fixed spawn point there facing the goal, a
    goal zone at `goal` and the task its body trains with. Its ids start with `prefix`, by default a free one."""
    info = library_bodies().get(body_id)
    if info is None:
        raise UnknownBody(body_id)
    prefix = prefix or free_prefix(project, "agent")
    body = library_body(body_id, prefix, start)
    heading = math.degrees(math.atan2(goal[1] - start[1], goal[0] - start[0]))
    spawn = Part(
        f"{prefix}spawn",
        f"{name} start",
        None,
        {
            "transform": {"position": (start[0], start[1], 0.0), "rotation": (0, 0, heading)},
            "spawn_point": {"mode": "fixed"},
        },
    ).spec()
    zone = Part(
        f"{prefix}goal",
        f"{name} goal",
        None,
        {"transform": {"position": (goal[0], goal[1], 0.0)}, "goal_zone": {"radius": goal_radius}},
    ).spec()
    rewards = [RewardTermSpec(term=term, weight=REWARD_TERMS[term].default_weight) for term in info.rewards]
    agent = AgentSpec(
        id=prefix[:-1],
        name=name,
        body=body.id,
        task=TaskSpec(family=info.family, rewards=rewards),
        spawn=spawn.id,
        goal=zone.id,
    )
    return [
        CreateObject(op="create_object", target="world", object=spawn),
        CreateObject(op="create_object", target="world", object=zone),
        AddAgent(op="add_agent", agent=agent, body=body),
    ]
