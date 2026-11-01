from collections.abc import Sequence

from icarus.contracts.errors import ValidationIssue
from icarus.contracts.objects import ObjectSpec
from icarus.contracts.operations import (
    AddBody,
    AddComponent,
    CreateObject,
    DeleteObject,
    EditOperation,
    RemoveBody,
    RemoveComponent,
    RemoveRewardTerm,
    RenameObject,
    RenameProject,
    ReparentObject,
    SetBrain,
    SetProperty,
    SetRewardTerm,
    SetTaskFamily,
)
from icarus.contracts.project import BrainSpec, Project, TaskSpec, WorldSpec
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


def _apply(project: Project, operation: EditOperation) -> None:
    match operation:
        case CreateObject(target=target, object=obj):
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
        case RenameObject(object=object_id, name=name):
            _object(project, object_id)[1].name = name
        case ReparentObject(object=object_id, parent=parent):
            _object(project, object_id)[1].parent = parent
        case AddComponent(object=object_id, component=component):
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
            component.properties[prop] = value
        case AddBody(body=body):
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
        case SetTaskFamily(family=family):
            project.task.family = family
        case SetRewardTerm(term=term):
            project.task.rewards = [*(item for item in project.task.rewards if item.term != term.term), term]
        case RemoveRewardTerm(term=term_id):
            if not any(item.term == term_id for item in project.task.rewards):
                raise _fail(f"task.rewards.{term_id}", f"The task has no reward term {term_id!r}")
            project.task.rewards = [item for item in project.task.rewards if item.term != term_id]
        case SetBrain(template=template, copies=copies, seed=seed):
            brain = project.brain
            project.brain = BrainSpec(
                template=template if template is not None else brain.template,
                copies=copies if copies is not None else brain.copies,
                seed=seed if seed is not None else brain.seed,
            )


def apply_operations(project: Project, operations: Sequence[EditOperation]) -> Project:
    """A new document with the operations applied in order; the input is never changed."""
    candidate = project.model_copy(deep=True)
    for operation in operations:
        _apply(candidate, operation)
    return candidate
