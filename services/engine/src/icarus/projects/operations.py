from collections.abc import Sequence

from icarus.contracts.errors import ValidationIssue
from icarus.contracts.objects import ObjectSpec
from icarus.contracts.operations import (
    AddAgent,
    AddBody,
    AddComponent,
    CreateObject,
    DeleteObject,
    EditOperation,
    RemoveAgent,
    RemoveBody,
    RemoveComponent,
    RemoveRewardTerm,
    RenameObject,
    RenameProject,
    ReparentObject,
    SetAgent,
    SetBrain,
    SetEpisode,
    SetProperty,
    SetRewardTerm,
    SetTaskFamily,
)
from icarus.contracts.project import BodySpec, BrainSpec, Project, TaskSpec, WorldSpec
from icarus.contracts.properties import ListValue, PropertyValue, SliderValue
from icarus.contracts.specs import AgentSpec
from icarus.library.materials import MATERIALS
from icarus.projects.agents import (
    UnknownAgent,
    collapse_single,
    find_agent,
    lane_objects,
    with_children,
    without_objects,
)
from icarus.projects.brain_masks import mask_problem, prune_masks
from icarus.projects.document import find_object


class OperationError(Exception):
    def __init__(self, issues: list[ValidationIssue]) -> None:
        super().__init__("; ".join(issue.message for issue in issues))
        self.issues = issues


def _fail(path: str, message: str) -> OperationError:
    return OperationError([ValidationIssue(path=path, message=message)])


def empty_project(id: str, name: str) -> Project:
    return Project(
        id=id,
        name=name,
        schema_version=1,
        world=WorldSpec(objects=[]),
        bodies=[],
        task=TaskSpec(family="none", rewards=[]),
        brain=BrainSpec(template=None, copies=16, seed=0),
    )


def _object(project: Project, object_id: str) -> tuple[list[ObjectSpec], ObjectSpec]:
    found = find_object(project, object_id)
    if found is None:
        raise _fail(f"objects.{object_id}", f"There is no object {object_id!r}")
    return found


def _descendants(objects: list[ObjectSpec], root: str) -> set[str]:
    removed = {root}
    grew = True
    while grew:
        grew = False
        for obj in objects:
            if obj.parent in removed and obj.id not in removed:
                removed.add(obj.id)
                grew = True
    return removed


def _component_path(object_id: str, component_id: str) -> str:
    return f"objects.{object_id}.components.{component_id}"


def _brain(project: Project, brain: BrainSpec, change: SetBrain) -> BrainSpec:
    included = {"template", "copies", "seed", "algorithm", "layers", "decisions_per_second"}
    fields = change.model_dump(include=included | {"muted_senses", "muted_motors"}, exclude_none=True)
    if change.muted_senses is not None or change.muted_motors is not None:
        senses = list(dict.fromkeys(change.muted_senses if change.muted_senses is not None else brain.muted_senses))
        motors = list(dict.fromkeys(change.muted_motors if change.muted_motors is not None else brain.muted_motors))
        if problem := mask_problem(project, senses, motors):
            raise _fail("brain.muted", problem)
        fields["muted_senses"], fields["muted_motors"] = senses, motors
    if change.start_from is not None:
        fields["start_from"] = None if change.start_from == "none" else change.start_from.model_dump()
    if change.training_steps is not None:
        fields["training_steps"] = None if change.training_steps == "recommended" else change.training_steps
    if change.ppo is not None:
        fields["ppo"] = brain.ppo.model_copy(update=change.ppo.model_dump(exclude_none=True))
    # Validated again so the document never holds a value outside its contract.
    return BrainSpec.model_validate({**brain.model_dump(), **fields})


def _pick_material(obj: ObjectSpec, value: PropertyValue) -> None:
    """A palette material brings its grip along: the object's surface and the friction of its collider and surface."""
    preset = MATERIALS.get(value.value) if isinstance(value, ListValue) else None
    if preset is None:
        return
    for component in obj.components:
        match component.kind:
            case "material":
                component.properties["surface"] = ListValue(type="list", value=preset.surface)
            case "collider":
                component.properties["friction"] = SliderValue(type="slider", value=preset.friction)
            case "surface":
                component.properties["kind"] = ListValue(type="list", value=preset.surface)
                component.properties["friction"] = SliderValue(type="slider", value=preset.friction)
            case _:
                pass


def _apply(project: Project, operation: EditOperation) -> None:
    match operation:
        case CreateObject(target=target, object=obj):
            obj = obj.model_copy(deep=True)
            if find_object(project, obj.id) is not None:
                raise _fail(f"objects.{obj.id}", f"An object with id {obj.id!r} already exists")
            if target == "world":
                project.world.objects.append(obj)
                return
            body = next((item for item in project.bodies if item.id == target), None)
            if body is None:
                targets = ", ".join(['"world"', *(item.id for item in project.bodies)])
                message = f"There is no body {target!r}; the target of create_object must be one of: {targets}"
                raise _fail(f"bodies.{target}", message)
            body.objects.append(obj)
        case DeleteObject(object=object_id):
            objects, _ = _object(project, object_id)
            removed = _descendants(objects, object_id)
            objects[:] = [obj for obj in objects if obj.id not in removed]
            project.agents = [without_objects(agent, removed) for agent in project.agents]
        case RenameObject(object=object_id, name=name):
            _object(project, object_id)[1].name = name
        case ReparentObject(object=object_id, parent=parent):
            _object(project, object_id)[1].parent = parent
        case AddComponent(object=object_id, component=component):
            component = component.model_copy(deep=True)
            obj = _object(project, object_id)[1]
            if any(item.id == component.id for item in obj.components):
                raise _fail(_component_path(object_id, component.id), f"{obj.name} already has {component.id!r}")
            obj.components.append(component)
        case RemoveComponent(object=object_id, component=component_id):
            obj = _object(project, object_id)[1]
            if not any(item.id == component_id for item in obj.components):
                raise _fail(_component_path(object_id, component_id), f"{obj.name} has no {component_id!r}")
            obj.components = [item for item in obj.components if item.id != component_id]
        case SetProperty(object=object_id, component=component_id, property=prop, value=value):
            obj = _object(project, object_id)[1]
            component = next((item for item in obj.components if item.id == component_id), None)
            if component is None:
                raise _fail(_component_path(object_id, component_id), f"{obj.name} has no {component_id!r}")
            component.properties[prop] = value.model_copy(deep=True)
            if component.kind == "material" and prop == "preset":
                _pick_material(obj, value)
        case AddBody(body=body):
            body = body.model_copy(deep=True)
            if any(item.id == body.id for item in project.bodies):
                raise _fail(f"bodies.{body.id}", f"A body with id {body.id!r} already exists")
            project.bodies.append(body)
        case RemoveBody(body=body_id):
            if not any(item.id == body_id for item in project.bodies):
                raise _fail(f"bodies.{body_id}", f"There is no body {body_id!r}")
            project.bodies = [item for item in project.bodies if item.id != body_id]
        case RenameProject(name=name, description=description):
            project.name = name
            if description is not None:
                project.description = description
        case SetTaskFamily(family=family, agent=agent_id):
            _task(project, agent_id).family = family
        case SetRewardTerm(term=term, agent=agent_id):
            term = term.model_copy(deep=True)
            task = _task(project, agent_id)
            task.rewards = [*(item for item in task.rewards if item.term != term.term), term]
        case RemoveRewardTerm(term=term_id, agent=agent_id):
            task = _task(project, agent_id)
            if not any(item.term == term_id for item in task.rewards):
                raise _fail(f"task.rewards.{term_id}", f"The task has no reward term {term_id!r}")
            task.rewards = [item for item in task.rewards if item.term != term_id]
        case SetBrain(agent=None):
            project.brain = _brain(project, project.brain, operation)
        case SetBrain(agent=str() as agent_id):
            agent = _agent(project, agent_id)
            agent.brain = _brain(project, agent.brain or project.brain, operation)
        case SetEpisode(agent=agent_id):
            task = _task(project, agent_id)
            if operation.seconds is not None:
                task.episode_seconds = operation.seconds
            if operation.end_on_fall is not None:
                task.end_on_fall = operation.end_on_fall
            if operation.end_on_success is not None:
                task.end_on_success = operation.end_on_success
        case AddAgent(agent=agent, body=body):
            _add_agent(project, agent, body)
        case RemoveAgent(agent=agent_id):
            _remove_agent(project, agent_id)
        case SetAgent():
            _set_agent(project, operation)


def _agent(project: Project, agent_id: str) -> AgentSpec:
    try:
        return find_agent(project, agent_id)
    except UnknownAgent:
        names = ", ".join(repr(item.id) for item in project.agents) or "none"
        raise _fail(f"agents.{agent_id}", f"There is no agent {agent_id!r}; the agents are {names}") from None


def _task(project: Project, agent_id: str | None) -> TaskSpec:
    """The task an operation changes: the project's, or an agent's own, which starts as a copy of the project's."""
    if agent_id is None:
        return project.task
    agent = _agent(project, agent_id)
    if agent.task is None:
        agent.task = project.task.model_copy(deep=True)
    return agent.task


def _add_agent(project: Project, agent: AgentSpec, body: BodySpec | None) -> None:
    agent = agent.model_copy(deep=True)
    if body is not None:
        if body.id != agent.body:
            raise _fail(f"agents.{agent.id}.body", f"The agent drives {agent.body!r} but the body added is {body.id!r}")
        _apply(project, AddBody(op="add_body", body=body))
    if not project.agents and project.bodies and project.bodies[0].id != agent.body:
        first = project.bodies[0]
        project.agents.append(AgentSpec(id=first.id, name=first.name, body=first.id))
    if any(item.id == agent.id for item in project.agents):
        raise _fail(f"agents.{agent.id}", f"An agent with id {agent.id!r} already exists")
    project.agents.append(agent)


def _remove_agent(project: Project, agent_id: str) -> None:
    agent = _agent(project, agent_id)
    project.agents = [item for item in project.agents if item.id != agent_id]
    if not any(item.body == agent.body for item in project.agents):
        project.bodies = [body for body in project.bodies if body.id != agent.body]
    kept: set[str] = set().union(*(lane_objects(item) for item in project.agents))
    removed = with_children(project.world.objects, lane_objects(agent) - kept)
    project.world.objects = [obj for obj in project.world.objects if obj.id not in removed]
    project.agents = [without_objects(item, removed) for item in project.agents]
    collapse_single(project)


def _set_agent(project: Project, change: SetAgent) -> None:
    agent = _agent(project, change.agent)
    if change.name is not None:
        agent.name = change.name
    if change.spawn is not None:
        agent.spawn = change.spawn or None
    if change.goal is not None:
        agent.goal = change.goal or None
    if change.objects is not None:
        agent.objects = list(dict.fromkeys(change.objects))


def apply_operations(project: Project, operations: Sequence[EditOperation]) -> Project:
    """A new document with the operations applied in order; the input is never changed."""
    candidate = project.model_copy(deep=True)
    for operation in operations:
        _apply(candidate, operation)
    prune_masks(candidate)
    return candidate
