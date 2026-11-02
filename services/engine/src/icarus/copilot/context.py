import json
from typing import Any

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.project import Project, ProjectState
from icarus.contracts.properties import PropertySchema, PropertyValue, RangeValue
from icarus.contracts.specs import BodySpec
from icarus.contracts.training import MetricPoint, RunStatus
from icarus.design.compiler import CompiledModel, CompileError, compile_project
from icarus.design.scene import object_extents, scene_description
from icarus.library.components import COMPONENTS
from icarus.library.pieces import PIECES
from icarus.library.rewards import REWARD_TERMS, term_families, term_fits
from icarus.library.templates import TEMPLATES, template_operations
from icarus.projects.document import all_objects, find_object
from icarus.projects.operations import apply_operations, empty_project
from icarus.sim.model_state import CONTROL_PERIOD
from icarus.training.run_store import RunStore
from icarus.training.schedule import RECOMMENDED_STEPS

RECENT_EVALUATIONS = 5
NO_RUN = "No training has run for this project yet"
# A run shorter than this share of the recommended budget is too short to judge learning by.
FAR_BELOW = 0.25


def _plain(value: PropertyValue) -> Any:
    if isinstance(value, RangeValue):
        return [value.low, value.high]
    return value.value


def property_schema(schema: PropertySchema, with_hint: bool) -> dict[str, Any]:
    entry: dict[str, Any] = {"label": schema.label, "type": schema.type}
    for key in ("unit", "min", "max", "step"):
        if getattr(schema, key) is not None:
            entry[key] = getattr(schema, key)
    if schema.options:
        entry["options"] = [option.value for option in schema.options]
    if with_hint and schema.hint:
        entry["hint"] = schema.hint
    return entry


def _components(obj: ObjectSpec) -> dict[str, dict[str, Any]]:
    return {
        component.id: {prop: _plain(value) for prop, value in component.properties.items()}
        for component in obj.components
    }


def _objects(state: ProjectState) -> dict[str, dict[str, Any]]:
    project = state.project
    placed = [("world", obj) for obj in project.world.objects]
    placed += [(body.id, obj) for body in project.bodies for obj in body.objects]
    return {
        obj.id: {"name": obj.name, "in": where, "parent": obj.parent, "components": _components(obj)}
        for where, obj in placed
    }


def object_detail(state: ProjectState, object_id: str | None) -> dict[str, Any] | None:
    """One object's components with their values and full property schemas, or None when it does not exist."""
    found = find_object(state.project, object_id) if object_id else None
    if found is None:
        return None
    obj = found[1]
    components: dict[str, Any] = {}
    for component in obj.components:
        kind = COMPONENTS.get(component.kind)
        schemas = {schema.id: property_schema(schema, True) for schema in kind.properties} if kind else {}
        components[component.id] = {
            "kind": component.kind,
            "label": kind.label if kind else component.kind,
            "values": {prop: _plain(value) for prop, value in component.properties.items()},
            "schema": schemas,
        }
    return {"id": obj.id, "name": obj.name, "components": components}


def _library(state: ProjectState) -> dict[str, Any]:
    used = {component.kind for obj in all_objects(state.project) for component in obj.components}
    return {
        "components": {
            kind: {
                "label": spec.label,
                "properties": {schema.id: property_schema(schema, False) for schema in spec.properties},
            }
            for kind, spec in COMPONENTS.items()
            if kind in used or kind in ("light", "material", "randomize", "sky")
        },
        "reward_terms": {
            term: {
                "label": info.label,
                "families": sorted(term_families(term)),
                "weight": [info.weight_min, info.weight_max],
            }
            for term, info in REWARD_TERMS.items()
            if term_fits(term, state.project.task.family)
        },
        "pieces": {piece_id: piece.description for piece_id, piece in PIECES.items()},
        "templates": {template_id: info.description for template_id, info in TEMPLATES.items()},
    }


def _episodes(point: MetricPoint) -> dict[str, Any]:
    return {
        "step": point.step,
        "episode_return": point.episode_return,
        "episode_length": point.episode_length,
        "episode_seconds": None if point.episode_length is None else round(point.episode_length * CONTROL_PERIOD, 2),
        "success_rate": point.success_rate,
        "failure_rate": point.failure_rate,
        "reward_terms": point.reward_terms,
    }


def _latest_run(state: ProjectState, runs: RunStore) -> dict[str, Any] | str:
    statuses = runs.list_runs(state.project.id)
    return run_facts(state, runs, statuses[0]) if statuses else NO_RUN


def run_facts(state: ProjectState, runs: RunStore, status: RunStatus) -> dict[str, Any]:
    """A run's status, its latest evaluations and training episodes, and how its length compares with the budget."""
    metrics = runs.folder(status.run_id).metrics()
    evaluations = [point for point in metrics if point.kind == "eval"]
    training = [point for point in metrics if point.kind == "train"]
    recommended = RECOMMENDED_STEPS[state.project.task.family]
    return {
        "name": status.name,
        "state": status.state,
        "revision": status.revision_number,
        "step": status.step,
        "total_steps": status.total_steps,
        "recommended_steps": recommended,
        "far_below_recommended": status.total_steps < recommended * FAR_BELOW,
        "copies": status.copies,
        # One step is one control decision, so steps convert to simulated seconds only through this rate.
        "control_rate_hz": round(1 / CONTROL_PERIOD),
        "best_step": status.best_step,
        "success_rate": status.success_rate,
        # The step of the evaluation that measured success_rate; the run's own step is usually further on.
        "success_measured_at_step": evaluations[-1].step if evaluations else None,
        "failure": status.failure.reason if status.failure else None,
        "evaluations": [
            {
                "step": point.step,
                "episode_return": point.episode_return,
                "success_rate": point.success_rate,
                "failure_rate": point.failure_rate,
            }
            for point in evaluations[-RECENT_EVALUATIONS:]
        ],
        "latest_evaluation": _episodes(evaluations[-1]) if evaluations else None,
        "latest_training": _episodes(training[-1]) if training else None,
    }


def _compiled(project: Project) -> CompiledModel | None:
    try:
        return compile_project(project)
    except CompileError:
        return None


def _bodies(project: Project, compiled: CompiledModel | None = None) -> list[dict[str, Any]]:
    compiled = compiled or _compiled(project)
    return [
        {
            "id": body.id,
            "name": body.name,
            "size": object_extents(compiled, [obj.id for obj in body.objects]) if compiled else None,
        }
        for body in project.bodies
    ]


def project_context(state: ProjectState, runs: RunStore, selection: str | None, workspace: str | None) -> str:
    """Everything the copilot may cite about a project, as JSON: its numbers are the only ones it can use."""
    project = state.project
    context = {
        "project": {
            "id": project.id,
            "name": project.name,
            "revision": state.revision.number,
            "objects": _objects(state),
            # Length, width and height in metres of the box around each body, for clearance checks.
            "bodies": _bodies(project),
            "task": {
                "family": project.task.family,
                "rewards": [{"term": term.term, "weight": term.weight} for term in project.task.rewards],
            },
            "brain": project.brain.model_dump(exclude_defaults=True),
            "design_checks": [{"check": check.label, "status": check.status} for check in state.report.checks],
        },
        "selection": object_detail(state, selection),
        "workspace": workspace,
        "library": _library(state),
        "latest_run": _latest_run(state, runs),
    }
    return json.dumps(context, ensure_ascii=False, separators=(",", ":"))


RUN_HEADLINE = (
    "name",
    "state",
    "step",
    "total_steps",
    "recommended_steps",
    "far_below_recommended",
    "success_rate",
    "success_measured_at_step",
)


def _rounded(values: Any) -> Any:
    if isinstance(values, float):
        return round(values, 3)
    if isinstance(values, list | tuple):
        return [_rounded(value) for value in values]
    return values


def _placement(obj: ObjectSpec) -> dict[str, Any]:
    """Where an object is and how big it is, from its transform and mesh, so layout questions need no lookup."""
    facts: dict[str, Any] = {}
    for component in obj.components:
        for prop, key in (("position", "position"), ("rotation", "rotation"), ("size", "size"), ("shape", "shape")):
            if component.kind in ("transform", "mesh") and prop in component.properties:
                value = _plain(component.properties[prop])
                if key != "rotation" or any(value):
                    facts[key] = _rounded(value)
    return facts


def lean_context(
    state: ProjectState, runs: RunStore, selection: str | None, workspace: str | None, open_proposal: str | None
) -> str:
    """The project as the agent always sees it: rebuilt from live state every turn, details fetched by tools."""
    project = state.project
    compiled = _compiled(project)
    zones = scene_description(compiled, state.revision.number).zones if compiled else []
    placed = [("world", obj) for obj in project.world.objects]
    placed += [(body.id, obj) for body in project.bodies for obj in body.objects]
    latest = _latest_run(state, runs)
    context = {
        "project": {"id": project.id, "name": project.name, "revision": state.revision.number},
        "objects": [
            {"id": obj.id, "name": obj.name, "in": where, "parent": obj.parent}
            | {"kinds": [component.kind for component in obj.components]}
            | _placement(obj)
            for where, obj in placed
        ],
        # Length, width and height in metres of the box around each body, for clearance checks.
        "bodies": _bodies(project, compiled),
        "zones": [
            {"name": zone.name, "kind": zone.kind, "position": _rounded(zone.position), "size": _rounded(zone.size)}
            for zone in zones
        ],
        "task": {
            "family": project.task.family,
            "rewards": [{"term": term.term, "weight": term.weight} for term in project.task.rewards],
        },
        "brain": project.brain.model_dump(exclude_defaults=True),
        "design_checks": [{"check": check.label, "status": check.status} for check in state.report.checks],
        "latest_run": latest if isinstance(latest, str) else {key: latest[key] for key in RUN_HEADLINE},
        "selection": object_detail(state, selection),
        "workspace": workspace,
        "open_proposal": open_proposal,
        "library": {
            "component_kinds": sorted(COMPONENTS),
            "pieces": sorted(PIECES),
            "reward_terms": sorted(term for term in REWARD_TERMS if term_fits(term, project.task.family)),
            "task_families": sorted({info.family for info in REWARD_TERMS.values()}),
            "templates": {template_id: info.label for template_id, info in TEMPLATES.items()},
        },
    }
    return json.dumps(context, ensure_ascii=False, separators=(",", ":"))


SENSOR_KINDS = ("distance_ray", "balance", "touch")


def _choices(kind: str, prop: str) -> list[str]:
    schema = next(schema for schema in COMPONENTS[kind].properties if schema.id == prop)
    return [str(option.value) for option in schema.options or []]


def _abilities(body: BodySpec) -> dict[str, Any]:
    kinds = [component.kind for obj in body.objects for component in obj.components]
    return {"motors": kinds.count("motor"), "sensors": sorted({kind for kind in kinds if kind in SENSOR_KINDS})}


def design_rules() -> dict[str, str]:
    joints = [kind for kind in _choices("joint", "kind") if kind != "fixed"]
    return {
        "create_object": (
            'Its "target" is "world" for scenery and obstacles, or one of the body ids listed under a template\'s '
            '"bodies" to add a part to that body; never an object id, a piece id or a template id. Its object.id is '
            "a new id used nowhere else in the project."
        ),
        "movement": (
            f"Bodies move only through motors ({', '.join(_choices('motor', 'kind'))}) that drive their joints "
            f"({', '.join(joints)}). The library has no thruster, propeller, wing or buoyancy: nothing can fly, "
            "hover or swim, and a body without motors cannot learn to move."
        ),
    }


def design_reference() -> str:
    """The library as the architect needs it: templates with where their objects live, pieces, components, rewards."""
    templates: dict[str, Any] = {}
    for template_id, info in TEMPLATES.items():
        project = apply_operations(empty_project("000000000000", info.label), template_operations(template_id))
        templates[template_id] = {
            "label": info.label,
            "family": info.family,
            "description": info.description,
            "world": [obj.id for obj in project.world.objects],
            "bodies": {body.id: [obj.id for obj in body.objects] for body in project.bodies},
            "abilities": {body.id: _abilities(body) for body in project.bodies},
            "objects": {
                obj.id: {"name": obj.name, "components": [c.id for c in obj.components]} for obj in all_objects(project)
            },
        }
    reference = {
        "rules": design_rules(),
        "templates": templates,
        "pieces": {piece_id: piece.object.model_dump() for piece_id, piece in PIECES.items()},
        "components": {
            kind: {schema.id: property_schema(schema, False) for schema in spec.properties}
            for kind, spec in COMPONENTS.items()
        },
        "reward_terms": {
            term: {"families": sorted(term_families(term)), "weight": [info.weight_min, info.weight_max]}
            for term, info in REWARD_TERMS.items()
        },
    }
    return json.dumps(reference, ensure_ascii=False, separators=(",", ":"))
