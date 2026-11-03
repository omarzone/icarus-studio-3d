from icarus.contracts.errors import ValidationIssue
from icarus.contracts.objects import ComponentSpec, ObjectSpec
from icarus.contracts.project import Project
from icarus.contracts.properties import AssetValue, ChoiceValue
from icarus.contracts.specs import MAX_LAYERS, RewardTermSpec
from icarus.library.components import COMPONENTS
from icarus.library.properties import check_value
from icarus.library.rewards import REWARD_TERMS, TERM_SETTINGS, term_families, term_fits
from icarus.library.skin_objects import SKIN_ID
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
    if component.kind == "skin":
        asset = _reference(component, "asset")
        if asset and not SKIN_ID.fullmatch(asset):
            message = f"Skin on {obj.name} names {asset!r}, which is not a stored model's id"
            return [ValidationIssue(path=f"{base}.asset", message=message)]
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
        elif not term_fits(term.term, project.task.family):
            families = " and ".join(sorted(term_families(term.term)))
            issues.append(ValidationIssue(path=path, message=f"{info.label} is for {families} tasks"))
        elif not info.weight_min <= term.weight <= info.weight_max:
            bounds = f"between {info.weight_min:g} and {info.weight_max:g}"
            issues.append(ValidationIssue(path=path, message=f"{info.label} weight must be {bounds}"))
        label = info.label if info else term.term
        schemas = {schema.id: schema for schema in TERM_SETTINGS.get(term.term, [])}
        for param, value in term.params.items():
            schema = schemas.get(param)
            problem = f"{label} has no setting {param!r}" if schema is None else check_value(schema, value)
            if problem:
                issues.append(ValidationIssue(path=f"{path}.params.{param}", message=problem))
        if term.term == "object_to_goal":
            issues += _carried_object_issues(project, term, f"{path}.params.object")
    return issues


def _movable(obj: ObjectSpec) -> bool:
    """A world object that moves on its own: a root with a dynamic physics body and no joint holding it."""
    physics = next((item for item in obj.components if item.kind == "physics_body"), None)
    mode = physics.properties.get("mode") if physics else None
    dynamic = physics is not None and (not isinstance(mode, ChoiceValue) or mode.value == "dynamic")
    return dynamic and obj.parent is None and not any(item.kind == "joint" for item in obj.components)


def _carried_object_issues(project: Project, term: RewardTermSpec, path: str) -> list[ValidationIssue]:
    target = term.params.get("object")
    target_id = target.value if isinstance(target, AssetValue) else ""
    world = {obj.id: obj for obj in project.world.objects}
    if not target_id:
        message = "Bring the object to the goal needs an object: the id of a movable world object"
    elif target_id in {obj.id for body in project.bodies for obj in body.objects}:
        message = f"{target_id!r} is part of a body; the object to bring must be a world object"
    elif target_id not in world:
        message = f"Bring the object to the goal names {target_id!r}, which does not exist"
    elif not _movable(world[target_id]):
        message = f"{world[target_id].name} is fixed in place; the object to bring must be movable"
    else:
        return []
    return [ValidationIssue(path=path, message=message)]


def _randomize_issues(project: Project) -> list[ValidationIssue]:
    """Body parts never vary per copy: moving one would tear its joints, so only world objects take Randomize."""
    return [
        ValidationIssue(
            path=f"objects.{obj.id}.components.{component.id}",
            message=f"{obj.name} is part of a body; only world objects can vary per copy",
        )
        for body in project.bodies
        for obj in body.objects
        for component in obj.components
        if component.kind == "randomize"
    ]


def _sky_issues(project: Project) -> list[ValidationIssue]:
    """A world has one sky at most, and a body never carries one."""
    issues = [
        ValidationIssue(
            path=f"objects.{obj.id}.components.{component.id}",
            message=f"{obj.name} is part of a body; a sky belongs to the world",
        )
        for body in project.bodies
        for obj in body.objects
        for component in obj.components
        if component.kind == "sky"
    ]
    skies = [obj for obj in project.world.objects if any(item.kind == "sky" for item in obj.components)]
    if len(skies) > 1:
        issues.append(ValidationIssue(path="objects", message="A world can have only one sky"))
    return issues


def _brain_issues(project: Project) -> list[ValidationIssue]:
    layers = len(project.brain.layers)
    if 1 <= layers <= MAX_LAYERS:
        return []
    message = f"The brain needs between 1 and {MAX_LAYERS} hidden layers, and has {layers}"
    return [ValidationIssue(path="brain.layers", message=message)]


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
    return issues + _randomize_issues(project) + _sky_issues(project) + _reward_issues(project) + _brain_issues(project)
