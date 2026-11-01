from icarus.contracts.errors import ValidationIssue
from icarus.contracts.objects import ComponentSpec, ObjectSpec
from icarus.contracts.project import Project
from icarus.contracts.properties import AssetValue
from icarus.library.components import COMPONENTS
from icarus.library.properties import check_value
from icarus.library.rewards import REWARD_TERMS
from icarus.projects.document import all_objects, containers


def _reference(component: ComponentSpec, prop: str) -> str:
    value = component.properties.get(prop)
    return value.value if isinstance(value, AssetValue) else ""


def _reference_issues(
    obj: ObjectSpec, component: ComponentSpec, base: str, ids: dict[str, ObjectSpec]
) -> list[ValidationIssue]:
    if component.kind == "motor":
        target_id = _reference(component, "joint") or obj.id
        target = ids.get(target_id)
        if target is None or not any(item.kind == "joint" for item in target.components):
            message = f"Motor on {obj.name} drives {target_id!r}, which has no joint"
            return [ValidationIssue(path=f"{base}.joint", message=message)]
    if component.kind == "joint":
        link = _reference(component, "connects_to")
        if link and link not in ids:
            message = f"Joint on {obj.name} connects to {link!r}, which does not exist"
            return [ValidationIssue(path=f"{base}.connects_to", message=message)]
    return []


def _component_issues(obj: ObjectSpec, ids: dict[str, ObjectSpec]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    seen: set[str] = set()
    for component in obj.components:
        base = f"objects.{obj.id}.components.{component.id}"
        kind = COMPONENTS.get(component.kind)
        if kind is None:
            issues.append(ValidationIssue(path=base, message=f"{component.kind!r} is not a library component"))
            continue
        if kind.unique and component.kind in seen:
            issues.append(ValidationIssue(path=base, message=f"{obj.name} can have only one {kind.label}"))
        seen.add(component.kind)
        schemas = {schema.id: schema for schema in kind.properties}
        for prop, value in component.properties.items():
            schema = schemas.get(prop)
            if schema is None:
                issues.append(ValidationIssue(path=f"{base}.{prop}", message=f"{kind.label} has no property {prop!r}"))
                continue
            problem = check_value(schema, value)
            if problem:
                issues.append(ValidationIssue(path=f"{base}.{prop}", message=f"{obj.name}: {problem}"))
        issues += _reference_issues(obj, component, base, ids)
    return issues


def _hierarchy_issues(objects: list[ObjectSpec]) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    parents = {obj.id: obj.parent for obj in objects}
    for obj in objects:
        path = f"objects.{obj.id}.parent"
        if obj.parent is not None and obj.parent not in parents:
            issues.append(ValidationIssue(path=path, message=f"{obj.name} is inside {obj.parent!r}, which is missing"))
            continue
        chain = [obj.id]
        current = obj.parent
        while current is not None and len(chain) <= len(parents):
            if current == obj.id:
                loop = " → ".join([*chain, obj.id])
                issues.append(ValidationIssue(path=path, message=f"Objects are inside each other: {loop}"))
                break
            chain.append(current)
            current = parents.get(current)
    return issues


def _reward_issues(project: Project) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    for term in project.task.rewards:
        info = REWARD_TERMS.get(term.term)
        path = f"task.rewards.{term.term}"
        if info is None:
            issues.append(ValidationIssue(path=path, message=f"{term.term!r} is not a library reward term"))
        elif info.family != project.task.family:
            issues.append(ValidationIssue(path=path, message=f"{info.label} is for {info.family} tasks"))
        elif not info.weight_min <= term.weight <= info.weight_max:
            bounds = f"between {info.weight_min:g} and {info.weight_max:g}"
            issues.append(ValidationIssue(path=path, message=f"{info.label} weight must be {bounds}"))
    return issues


def validate_project(project: Project) -> list[ValidationIssue]:
    """Every structural problem: ids, parents, components, property values, references and rewards."""
    issues: list[ValidationIssue] = []
    ids: dict[str, ObjectSpec] = {}
    for obj in all_objects(project):
        if obj.id in ids:
            issues.append(ValidationIssue(path=f"objects.{obj.id}", message=f"Two objects share the id {obj.id!r}"))
        ids[obj.id] = obj
    for objects in containers(project):
        issues += _hierarchy_issues(objects)
    for obj in all_objects(project):
        issues += _component_issues(obj, ids)
    spawns = [obj for obj in project.world.objects if any(item.kind == "spawn_point" for item in obj.components)]
    if len(spawns) > 1:
        issues.append(ValidationIssue(path="objects", message="A world can have only one spawn point"))
    return issues + _reward_issues(project)
