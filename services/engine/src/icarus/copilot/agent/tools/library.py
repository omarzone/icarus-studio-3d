from typing import Any

from pydantic import Field, model_validator

from icarus.contracts.operations import CreateObject
from icarus.contracts.project import Project
from icarus.copilot.agent.tools.base import Observation, Tool, ToolArgs, TurnScope
from icarus.copilot.agent.tools.inspect import compact
from icarus.copilot.context import property_schema
from icarus.copilot.step_words import step_said
from icarus.library.agents import library_bodies
from icarus.library.body_vault import VAULT_BODIES, use_vault_body
from icarus.library.components import COMPONENTS
from icarus.library.layouts import RECIPES, recipe_parameters
from icarus.library.pieces import PIECES, piece_summary, pieces_by_category
from icarus.library.rewards import REWARD_TERMS, term_families
from icarus.library.templates import TEMPLATES, template_operations
from icarus.projects.document import all_objects

MATCHES = 8


class LibraryArgs(ToolArgs):
    kind: str | None = Field(
        default=None,
        description="Exact id of a component kind, piece, vault body, reward term or template to read in full.",
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
            "category": piece.category,
            "description": piece_summary(piece),
            "object": piece.object.model_dump(),
            "component_schemas": schemas,
        }
    for term, info in REWARD_TERMS.items():
        entries[term] = {
            "type": "reward_term",
            "label": info.label,
            "families": sorted(term_families(term)),
            "weight": [info.weight_min, info.weight_max],
            "default_weight": info.default_weight,
            "description": info.description,
        }
    for recipe_id, recipe in RECIPES.items():
        entries[recipe_id] = {"type": "layout", "label": recipe.label, "description": recipe.description}
        entries[recipe_id]["parameters"] = recipe_parameters(recipe_id)
    for template_id, template in TEMPLATES.items():
        entries[template_id] = {"type": "template", "label": template.label, "family": template.family}
        entries[template_id]["description"] = template.description
    # A body shares an id with a template (humanoid): the body is listed with a suffix.
    for body_id, body in VAULT_BODIES.items():
        entries[body_id if body_id not in entries else f"{body_id}_body"] = {
            "type": "body",
            "label": body.label,
            "family": body.family,
            "description": body.description,
            "color": body.color,
            "rewards": {reward.term: reward.weight for reward in body.rewards},
            "vault_id": body_id,
        }
    for body_id, body in library_bodies().items():
        # Its body can also be another agent, through add_agent with this id as body.
        entries[body_id]["agent_body"] = {"name": body.name, "family": body.family, "rewards": body.rewards}
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
            return Observation(
                text, ok=False, summary=step_said("library_missing", scope.language, name=args.kind[:60])
            )
        if entry["type"] == "template":
            entry["operations_for_this_project"] = template_additions(scope.state.project, args.kind.strip())
        if entry["type"] == "body":
            operations = use_vault_body(scope.state.project, entry["vault_id"])
            entry["operations_for_this_project"] = [op.model_dump() for op in operations]
        return Observation(
            compact({"id": args.kind.strip(), **entry}),
            summary=step_said("library_read", scope.language, name=entry["label"]),
        )
    words = (args.query or "").lower().split()
    if {"bodies", "vault"} & set(words) or words == ["body"]:
        bodies = {key: entry["label"] for key, entry in entries.items() if entry["type"] == "body"}
        summary = step_said("library_search", scope.language, query=(args.query or "")[:40], count=len(bodies))
        return Observation(compact({"vault_bodies": bodies}), summary=summary)
    shelves = pieces_by_category()
    named = [category for category in shelves if category in words or category.rstrip("s") in words]
    if named:
        # A category asked by name lists all its pieces with their sizes, beyond the usual match limit.
        listed = {category: shelves[category] for category in named}
        summary = step_said("library_search", scope.language, query=(args.query or "")[:40], count=len(listed))
        return Observation(compact({"pieces_by_category": listed}), summary=summary)
    found = [
        {"id": entry_id, "type": entry["type"], "label": entry["label"]}
        for entry_id, entry in entries.items()
        if any(word in f"{entry_id} {entry['label']} {entry['type']}".lower() for word in words)
    ][: max(MATCHES, len(RECIPES)) if "layout" in words else MATCHES]
    summary = step_said("library_search", scope.language, query=(args.query or "")[:40], count=len(found))
    return Observation(compact(found) if found else "Nothing in the library matches.", summary=summary)


LIBRARY = Tool(
    name="library",
    description=(
        "Read the library, the only source of what can be built: a component kind with its property schemas and "
        "ranges, a ready-made piece with the valid values of its components, a reward term with its weight range, "
        "a template with the operations that add its bodies and task to this project (try them as they are or "
        "adapted), or a layout recipe with its parameters for the layout tool. Give an exact id in kind, or words "
        "in query to find up to 8 entries; the query layout lists the recipes. Pieces come in categories: "
        "basics, street, buildings, furniture, nature and props; a query naming one lists all its pieces with sizes. "
        "The query body lists the vault's ready-made bodies (biped, humanoid, dog, spider, hexapod, snake, rover, "
        "hopper and more); reading one gives the operations that make it this project's agent."
    ),
    args=LibraryArgs,
    step="library",
    effect="read",
    run=library,
    per_turn=None,
    timeout_s=5,
    observation_chars=16_000,
)
