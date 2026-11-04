from collections.abc import Sequence

from icarus.contracts.copilot import ProposalChange
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
    SetCurriculum,
    SetEpisode,
    SetMotionReference,
    SetProperty,
    SetRewardTerm,
    SetTaskFamily,
)
from icarus.contracts.project import Project
from icarus.contracts.properties import PropertyValue, RangeValue, SwitchValue, VectorValue
from icarus.contracts.specs import BrainSpec, CurriculumStage, TaskSpec
from icarus.library.components import COMPONENTS
from icarus.library.rewards import REWARD_TERMS
from icarus.projects.agents import agent_project
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


def _brain_facts(brain: BrainSpec) -> list[str]:
    ppo = brain.ppo
    return [
        f"template {brain.template}" if brain.template else "no template",
        f"{brain.copies} copies",
        f"seed {brain.seed}",
        brain.algorithm.upper(),
        f"{brain.training_steps:,} steps" if brain.training_steps else "recommended steps",
        f"layers {' x '.join(str(size) for size in brain.layers)}",
        f"learning rate {_number(ppo.learning_rate)}",
        f"{ppo.n_steps:,} steps per update",
        f"batch {ppo.batch_size:,}",
        f"{ppo.n_epochs} passes per update",
        f"discount {_number(ppo.gamma)}",
        f"advantage smoothing {_number(ppo.gae_lambda)}",
        f"exploration bonus {_number(ppo.ent_coef)}",
        f"{brain.decisions_per_second} decisions a second",
        f"senses off: {', '.join(brain.muted_senses)}" if brain.muted_senses else "every sense on",
        f"motors off: {', '.join(brain.muted_motors)}" if brain.muted_motors else "every motor on",
        f"starts from {brain.start_from.run_id} at {brain.start_from.step:,}"
        if brain.start_from
        else "starts from zero",
    ]


def _episode_facts(task: TaskSpec) -> str:
    ends = [f"{_number(task.episode_seconds)} s per try"]
    ends += ["ends on a fall"] if task.end_on_fall else ["keeps going after a fall"]
    ends += ["ends on success"] if task.end_on_success else ["keeps going after success"]
    return ", ".join(ends)


def _stage_names(stages: Sequence[CurriculumStage]) -> str:
    return " then ".join(stage.name for stage in stages) if stages else "One stage"


def _seen_by(project: Project, agent: str | None) -> Project:
    """The project as the agent an operation is for trains it; the project itself without one."""
    if agent is None or not any(item.id == agent for item in project.agents):
        return project
    return agent_project(project, agent)


def _agent_name(project: Project, agent_id: str) -> str:
    return next((item.name for item in project.agents if item.id == agent_id), agent_id)


def _brain_change(project: Project, op: SetBrain) -> ProposalChange:
    before = _brain_facts(_seen_by(project, op.agent).brain)
    after = _brain_facts(_seen_by(apply_operations(project, [op]), op.agent).brain)
    changed = [index for index, (old, new) in enumerate(zip(before, after, strict=True)) if old != new]
    if not changed:
        return ProposalChange(label="Brain", after="Unchanged")
    return ProposalChange(
        label="Brain",
        before=", ".join(before[index] for index in changed),
        after=", ".join(after[index] for index in changed),
    )


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
        case SetTaskFamily(family=family, agent=agent):
            return ProposalChange(label="Task", before=_seen_by(project, agent).task.family, after=family)
        case SetRewardTerm(term=term, agent=agent):
            info = REWARD_TERMS.get(term.term)
            rewards = _seen_by(project, agent).task.rewards
            old = next((item for item in rewards if item.term == term.term), None)
            label = f"Reward: {info.label if info else term.term}"
            return ProposalChange(label=label, before=_number(old.weight) if old else None, after=_number(term.weight))
        case RemoveRewardTerm(term=term_id):
            info = REWARD_TERMS.get(term_id)
            return ProposalChange(label=f"Reward: {info.label if info else term_id}", after="Removed")
        case SetMotionReference(reference=reference):
            return ProposalChange(label="Motion to copy", after=reference.name if reference else "Removed")
        case SetBrain():
            return _brain_change(project, op)
        case SetEpisode(agent=agent):
            before = _episode_facts(_seen_by(project, agent).task)
            after = _episode_facts(_seen_by(apply_operations(project, [op]), agent).task)
            return ProposalChange(label="Each try", before=before, after=after)
        case SetCurriculum(stages=stages, agent=agent):
            before = _stage_names(_seen_by(project, agent).task.curriculum)
            return ProposalChange(label="Curriculum", before=before, after=_stage_names(stages))
        case AddAgent(agent=agent):
            return ProposalChange(label=f"Agent {agent.name}", after="Added")
        case RemoveAgent(agent=agent_id):
            return ProposalChange(label=f"Agent {_agent_name(project, agent_id)}", after="Removed")
        case SetAgent(agent=agent_id, name=name):
            return ProposalChange(
                label=f"Agent {_agent_name(project, agent_id)}", after=f"Renamed {name}" if name else "Lane changed"
            )


def proposal_changes(project: Project, operations: Sequence[EditOperation]) -> list[ProposalChange]:
    """What each operation changes, read against the document as the earlier operations leave it."""
    changes: list[ProposalChange] = []
    current = project
    for op in operations:
        changes.append(_change(current, op))
        current = apply_operations(current, [op])
    return changes
