from typing import Any

from pydantic import Field, model_validator

from icarus.contracts.operations import CreateObject
from icarus.contracts.project import Project
from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TurnScope
from icarus.copilot.agent.tools.inspect import compact
from icarus.copilot.context import property_schema
from icarus.library.components import COMPONENTS
from icarus.library.pieces import PIECES
from icarus.library.rewards import REWARD_TERMS
from icarus.library.templates import TEMPLATES, template_operations
from icarus.projects.document import all_objects

MATCHES = 8


class LibraryArgs(ToolArgs):
    kind: str | None = Field(
        default=None, description="Exact id of a component kind, piece, reward term or template to read in full."
    )
    query: str | None = Field(default=None, description="Words to search in library ids and labels.")

    @model_validator(mode="after")
    def _one(self) -> "LibraryArgs":
        if not self.kind and not self.query:
            raise ValueError("give kind or query")
        return self


def _entries() -> dict[str, dict[str, Any]]:
    """Every library entry by id, as the agent reads it."""
    entries: dict[str, dict[str, Any]] = {}
    for kind, spec in COMPONENTS.items():
        entries[kind] = {
            "type": "component",
            "label": spec.label,
            "unique": spec.unique,
            "properties": {schema.id: property_schema(schema, True) for schema in spec.properties},
        }
    for piece_id, piece in PIECES.items():
        # The valid values of the piece's components travel with it, so a copy can be changed in one go.
        schemas = {
            component.id: {
                schema.id: property_schema(schema, False) for schema in COMPONENTS[component.kind].properties
            }
            for component in piece.object.components
            if component.kind in COMPONENTS
        }
        entries[piece_id] = {
            "type": "piece",
            "label": piece.label,
            "description": piece.description,
            "object": piece.object.model_dump(),
            "component_schemas": schemas,
        }
    for term, info in REWARD_TERMS.items():
        entries[term] = {
            "type": "reward_term",
            "label": info.label,
            "family": info.family,
            "weight": [info.weight_min, info.weight_max],
            "default_weight": info.default_weight,
            "description": info.description,
        }
    for template_id, template in TEMPLATES.items():
        entries[template_id] = {"type": "template", "label": template.label, "family": template.family}
        entries[template_id]["description"] = template.description
    return entries


def template_additions(project: Project, template_id: str) -> list[dict[str, Any]]:
    """The template's operations minus objects this project already has: they add its bodies and task here."""
    existing = {obj.id for obj in all_objects(project)}
    return [
        op.model_dump()
        for op in template_operations(template_id)
        if not (isinstance(op, CreateObject) and op.object.id in existing)
    ]


def library(scope: TurnScope, args: LibraryArgs) -> Observation:
    entries = _entries()
    if args.kind:
        entry = entries.get(args.kind.strip())
        if entry is None:
            text = f"There is no library entry `{args.kind}`. Ids: {', '.join(sorted(entries))}"
            return Observation(text, ok=False, summary=f"Looked up {args.kind[:60]} in the library: not found")
        if entry["type"] == "template":
            entry["operations_for_this_project"] = template_additions(scope.state.project, args.kind.strip())
        return Observation(compact({"id": args.kind.strip(), **entry}), summary=f"Read {entry['label']} in the library")
    words = (args.query or "").lower().split()
    found = [
        {"id": entry_id, "type": entry["type"], "label": entry["label"]}
        for entry_id, entry in entries.items()
        if any(word in f"{entry_id} {entry['label']}".lower() for word in words)
    ][:MATCHES]
    summary = f"Searched the library for “{(args.query or '')[:40]}”: {len(found)} found"
    return Observation(compact(found) if found else "Nothing in the library matches.", summary=summary)


LIBRARY = Tool(
    name="library",
    description=(
        "Read the library, the only source of what can be built: a component kind with its property schemas and "
        "ranges, a ready-made piece with the valid values of its components, a reward term with its weight range, "
        "or a template with the operations that add its bodies and task to this project (try them as they are or "
        "adapted). Give an exact id in kind, or words in query to find up to 8 entries."
    ),
    args=LibraryArgs,
    step="library",
    effect="read",
    run=library,
    per_turn=None,
    timeout_s=5,
    observation_chars=16_000,
)
