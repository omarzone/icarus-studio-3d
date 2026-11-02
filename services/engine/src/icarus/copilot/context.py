import json
from typing import Any

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.project import ProjectState
from icarus.contracts.properties import PropertySchema, PropertyValue, RangeValue
from icarus.library.components import COMPONENTS
from icarus.library.pieces import PIECES
from icarus.library.rewards import REWARD_TERMS
from icarus.library.templates import TEMPLATES, template_operations
from icarus.projects.document import all_objects, find_object
from icarus.projects.operations import apply_operations, empty_project
from icarus.training.run_store import RunStore

RECENT_EVALUATIONS = 5


def _plain(value: PropertyValue) -> Any:
    if isinstance(value, RangeValue):
        return [value.low, value.high]
    return value.value


def _schema(schema: PropertySchema, with_hint: bool) -> dict[str, Any]:
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


def _selection(state: ProjectState, selection: str | None) -> dict[str, Any] | None:
    found = find_object(state.project, selection) if selection else None
    if found is None:
        return None
    obj = found[1]
    components: dict[str, Any] = {}
    for component in obj.components:
        kind = COMPONENTS.get(component.kind)
        schemas = {schema.id: _schema(schema, True) for schema in kind.properties} if kind else {}
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
                "properties": {schema.id: _schema(schema, False) for schema in spec.properties},
            }
            for kind, spec in COMPONENTS.items()
            if kind in used or kind in ("light", "material")
        },
        "reward_terms": {
            term: {"label": info.label, "family": info.family, "weight": [info.weight_min, info.weight_max]}
            for term, info in REWARD_TERMS.items()
            if info.family == state.project.task.family
        },
        "pieces": {piece_id: piece.description for piece_id, piece in PIECES.items()},
        "templates": {template_id: info.description for template_id, info in TEMPLATES.items()},
    }


def _latest_run(state: ProjectState, runs: RunStore) -> dict[str, Any] | None:
    statuses = runs.list_runs(state.project.id)
    if not statuses:
        return None
    status = statuses[0]
    evaluations = [point for point in runs.folder(status.run_id).metrics() if point.kind == "eval"]
    return {
        "name": status.name,
        "state": status.state,
        "revision": status.revision_number,
        "step": status.step,
        "total_steps": status.total_steps,
        "copies": status.copies,
        "best_step": status.best_step,
        "success_rate": status.success_rate,
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
    }


def project_context(state: ProjectState, runs: RunStore, selection: str | None, workspace: str | None) -> str:
    """Everything the copilot may cite about a project, as JSON: its numbers are the only ones it can use."""
    project = state.project
    context = {
        "project": {
            "id": project.id,
            "name": project.name,
            "revision": state.revision.number,
            "objects": _objects(state),
            "bodies": [{"id": body.id, "name": body.name} for body in project.bodies],
            "task": {
                "family": project.task.family,
                "rewards": [{"term": term.term, "weight": term.weight} for term in project.task.rewards],
            },
            "brain": project.brain.model_dump(),
            "design_checks": [{"check": check.label, "status": check.status} for check in state.report.checks],
        },
        "selection": _selection(state, selection),
        "workspace": workspace,
        "library": _library(state),
        "latest_run": _latest_run(state, runs),
    }
    return json.dumps(context, ensure_ascii=False, separators=(",", ":"))


def design_reference() -> str:
    """The library as the architect needs it: templates with their objects, pieces, components and reward terms."""
    templates: dict[str, Any] = {}
    for template_id, info in TEMPLATES.items():
        project = apply_operations(empty_project("000000000000", info.label), template_operations(template_id))
        objects = {
            obj.id: {"name": obj.name, "components": [c.id for c in obj.components]} for obj in all_objects(project)
        }
        templates[template_id] = {
            "label": info.label,
            "family": info.family,
            "description": info.description,
            "objects": objects,
        }
    reference = {
        "templates": templates,
        "pieces": {piece_id: piece.object.model_dump() for piece_id, piece in PIECES.items()},
        "components": {
            kind: {schema.id: _schema(schema, False) for schema in spec.properties} for kind, spec in COMPONENTS.items()
        },
        "reward_terms": {
            term: {"family": info.family, "weight": [info.weight_min, info.weight_max]}
            for term, info in REWARD_TERMS.items()
        },
    }
    return json.dumps(reference, ensure_ascii=False, separators=(",", ":"))
