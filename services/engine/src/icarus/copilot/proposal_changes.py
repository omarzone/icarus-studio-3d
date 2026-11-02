from collections.abc import Sequence

from icarus.contracts.copilot import ProposalChange
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
from icarus.contracts.project import Project
from icarus.contracts.properties import PropertyValue, RangeValue, SwitchValue, VectorValue
from icarus.library.components import COMPONENTS
from icarus.library.rewards import REWARD_TERMS
from icarus.projects.document import find_object
from icarus.projects.operations import apply_operations


def _number(value: float) -> str:
    return f"{value:g}"


def shown(value: PropertyValue, unit: str | None = None) -> str:
    """A property value as a person reads it ("0.25", "#22252b", "(1, 0, 0) m")."""
    match value:
        case RangeValue(low=low, high=high):
            text = f"{_number(low)} to {_number(high)}"
        case VectorValue(value=vector):
            text = f"({', '.join(_number(item) for item in vector)})"
        case SwitchValue(value=on):
            return "On" if on else "Off"
        case _:
            text = _number(value.value) if isinstance(value.value, float | int) else str(value.value)
    return f"{text} {unit}" if unit else text


def _name(project: Project, object_id: str) -> str:
    found = find_object(project, object_id)
    return found[1].name if found else object_id


def _property(project: Project, op: SetProperty) -> ProposalChange:
    found = find_object(project, op.object)
    component = next((item for item in found[1].components if item.id == op.component), None) if found else None
    kind = COMPONENTS.get(component.kind) if component else None
    schema = next((item for item in kind.properties if item.id == op.property), None) if kind else None
    unit = schema.unit if schema else None
    old = component.properties.get(op.property) if component else None
    if old is None and schema is not None:
        old = schema.default
    label = f"{schema.label if schema else op.property} on {_name(project, op.object)}"
    return ProposalChange(label=label, before=shown(old, unit) if old else None, after=shown(op.value, unit))


def _change(project: Project, op: EditOperation) -> ProposalChange:
    match op:
        case SetProperty():
            return _property(project, op)
        case CreateObject(object=obj):
            return ProposalChange(label=obj.name, after="Added")
        case DeleteObject(object=object_id):
            return ProposalChange(label=_name(project, object_id), after="Removed")
        case RenameObject(object=object_id, name=name):
            return ProposalChange(label="Name", before=_name(project, object_id), after=name)
        case ReparentObject(object=object_id, parent=parent):
            after = _name(project, parent) if parent else "Top level"
            return ProposalChange(label=f"Parent of {_name(project, object_id)}", after=after)
        case AddComponent(object=object_id, component=component):
            kind = COMPONENTS.get(component.kind)
            label = f"{kind.label if kind else component.kind} on {_name(project, object_id)}"
            return ProposalChange(label=label, after="Added")
        case RemoveComponent(object=object_id, component=component_id):
            return ProposalChange(label=f"{component_id} on {_name(project, object_id)}", after="Removed")
        case AddBody(body=body):
            return ProposalChange(label=body.name, after="Added")
        case RemoveBody(body=body_id):
            body = next((item for item in project.bodies if item.id == body_id), None)
            return ProposalChange(label=body.name if body else body_id, after="Removed")
        case RenameProject(name=name):
            return ProposalChange(label="Project name", before=project.name, after=name)
        case SetTaskFamily(family=family):
            return ProposalChange(label="Task", before=project.task.family, after=family)
        case SetRewardTerm(term=term):
            info = REWARD_TERMS.get(term.term)
            old = next((item for item in project.task.rewards if item.term == term.term), None)
            label = f"Reward: {info.label if info else term.term}"
            return ProposalChange(label=label, before=_number(old.weight) if old else None, after=_number(term.weight))
        case RemoveRewardTerm(term=term_id):
            info = REWARD_TERMS.get(term_id)
            return ProposalChange(label=f"Reward: {info.label if info else term_id}", after="Removed")
        case SetBrain(template=template, copies=copies, seed=seed):
            parts = [
                f"template {template}" if template else "",
                f"{copies} copies" if copies else "",
                f"seed {seed}" if seed is not None else "",
            ]
            return ProposalChange(label="Brain", after=", ".join(part for part in parts if part) or "Unchanged")


def proposal_changes(project: Project, operations: Sequence[EditOperation]) -> list[ProposalChange]:
    """What each operation changes, read against the document as the earlier operations leave it."""
    changes: list[ProposalChange] = []
    current = project
    for op in operations:
        changes.append(_change(current, op))
        current = apply_operations(current, [op])
    return changes
