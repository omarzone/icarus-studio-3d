from pydantic import BaseModel, ConfigDict

from icarus.contracts.copilot import ProposalChange
from icarus.contracts.objects import ComponentSpec, ObjectSpec
from icarus.contracts.project import Project
from icarus.contracts.specs import RewardTermSpec
from icarus.copilot.proposal_changes import shown
from icarus.library.components import COMPONENTS
from icarus.library.rewards import REWARD_TERMS
from icarus.projects.document import all_objects
from icarus.projects.store import ProjectStore


class RevisionComparison(BaseModel):
    """What differs between two revisions of a project, read from their documents and grouped by what it touches."""

    model_config = ConfigDict(extra="forbid")

    a: int
    b: int
    objects: list[ProposalChange]
    components: list[ProposalChange]
    properties: list[ProposalChange]
    rewards: list[ProposalChange]
    # Bodies, the task family, the brain and the project's name.
    other: list[ProposalChange]


def _number(value: float) -> str:
    return f"{value:g}"


def _component_label(component: ComponentSpec, owner: str) -> str:
    kind = COMPONENTS.get(component.kind)
    return f"{kind.label if kind else component.kind} on {owner}"


def _properties(before: ComponentSpec, after: ComponentSpec, owner: str) -> list[ProposalChange]:
    kind = COMPONENTS.get(after.kind)
    schemas = {schema.id: schema for schema in kind.properties} if kind else {}
    changes = []
    for key in sorted(before.properties.keys() | after.properties.keys()):
        old, new = before.properties.get(key), after.properties.get(key)
        if old == new:
            continue
        schema = schemas.get(key)
        unit = schema.unit if schema else None
        label = f"{schema.label if schema else key} on {owner}"
        old = old or (schema.default if schema else None)
        new = new or (schema.default if schema else None)
        changes.append(
            ProposalChange(
                label=label, before=shown(old, unit) if old else None, after=shown(new, unit) if new else "Removed"
            )
        )
    return changes


def _object_changes(old: ObjectSpec, new: ObjectSpec, result: RevisionComparison, names: dict[str, str]) -> None:
    if old.name != new.name:
        result.objects.append(ProposalChange(label=f"Name of {old.name}", before=old.name, after=new.name))
    if old.parent != new.parent:
        before = names.get(old.parent, old.parent) if old.parent else "Top level"
        after = names.get(new.parent, new.parent) if new.parent else "Top level"
        result.objects.append(ProposalChange(label=f"Parent of {new.name}", before=before, after=after))
    olds = {component.id: component for component in old.components}
    news = {component.id: component for component in new.components}
    for component_id, component in olds.items():
        if component_id not in news or news[component_id].kind != component.kind:
            result.components.append(ProposalChange(label=_component_label(component, new.name), after="Removed"))
    for component_id, component in news.items():
        previous = olds.get(component_id)
        if previous is None or previous.kind != component.kind:
            result.components.append(ProposalChange(label=_component_label(component, new.name), after="Added"))
        else:
            result.properties += _properties(previous, component, new.name)


def _reward_label(term: str) -> str:
    info = REWARD_TERMS.get(term)
    return f"Reward: {info.label if info else term}"


def _rewards(before: list[RewardTermSpec], after: list[RewardTermSpec]) -> list[ProposalChange]:
    olds = {term.term: term for term in before}
    news = {term.term: term for term in after}
    changes = []
    for term_id, old in olds.items():
        new = news.get(term_id)
        if new is None:
            changes.append(ProposalChange(label=_reward_label(term_id), before=_number(old.weight), after="Removed"))
        elif new != old:
            after_text = _number(new.weight) if new.params == old.params else f"{_number(new.weight)}, new settings"
            changes.append(ProposalChange(label=_reward_label(term_id), before=_number(old.weight), after=after_text))
    for term_id, new in news.items():
        if term_id not in olds:
            changes.append(
                ProposalChange(label=_reward_label(term_id), after=f"Added with weight {_number(new.weight)}")
            )
    return changes


def _other(old: Project, new: Project) -> list[ProposalChange]:
    changes = []
    if old.name != new.name:
        changes.append(ProposalChange(label="Project name", before=old.name, after=new.name))
    if old.task.family != new.task.family:
        changes.append(ProposalChange(label="Task", before=old.task.family, after=new.task.family))
    if old.brain != new.brain:
        before = f"template {old.brain.template}, {old.brain.copies} copies, seed {old.brain.seed}"
        after = f"template {new.brain.template}, {new.brain.copies} copies, seed {new.brain.seed}"
        changes.append(ProposalChange(label="Brain", before=before, after=after))
    old_bodies = {body.id: body.name for body in old.bodies}
    new_bodies = {body.id: body.name for body in new.bodies}
    changes += [
        ProposalChange(label=name, after="Body removed") for key, name in old_bodies.items() if key not in new_bodies
    ]
    changes += [
        ProposalChange(label=name, after="Body added") for key, name in new_bodies.items() if key not in old_bodies
    ]
    return changes


def compare_revisions(store: ProjectStore, project_id: str, a: int, b: int) -> RevisionComparison:
    """What changed from revision a to revision b, by document, so revisions on different undo branches compare too."""
    old, new = store.project_at(project_id, a), store.project_at(project_id, b)
    result = RevisionComparison(a=a, b=b, objects=[], components=[], properties=[], rewards=[], other=[])
    olds = {obj.id: obj for obj in all_objects(old)}
    news = {obj.id: obj for obj in all_objects(new)}
    names = {**{key: obj.name for key, obj in olds.items()}, **{key: obj.name for key, obj in news.items()}}
    for object_id, obj in olds.items():
        if object_id not in news:
            result.objects.append(ProposalChange(label=obj.name, after="Removed"))
    for object_id, obj in news.items():
        previous = olds.get(object_id)
        if previous is None:
            result.objects.append(ProposalChange(label=obj.name, after="Added"))
        else:
            _object_changes(previous, obj, result, names)
    result.rewards = _rewards(old.task.rewards, new.task.rewards)
    result.other = _other(old, new)
    return result
