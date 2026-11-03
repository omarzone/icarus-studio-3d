import json
import re
from typing import Any

from pydantic import ValidationError

from icarus.contracts.bundles import UnpackBundle
from icarus.contracts.project import Project, ProjectState
from icarus.contracts.properties import AssetValue
from icarus.library import LIBRARY_VERSION
from icarus.projects.document import all_objects
from icarus.projects.store import ProjectStore

BUNDLE_FORMAT = "icarus.bundle"
FORMAT_VERSIONS = frozenset({1})
# `project-<schema_version>` of every project document this engine reads.
PROJECT_CONTRACTS = frozenset({"project-1"})
ENVELOPE_KEYS = frozenset(
    {"format", "format_version", "kind", "contract_version", "library_version", "created_with", "lineage", "project"}
)
MAX_BYTES = 16 * 1024 * 1024
MAX_DEPTH = 48
MAX_NODES = 250_000
MAX_STRING = 20_000
# A string that carries a script or a program instead of describing something; the community refuses the same.
CODE_MARKERS = re.compile(
    r"<script|javascript:|\bdata:(?!image/(png|jpeg|webp)[;,])[a-z]+/[a-z0-9.+-]+[;,]|^#!", re.IGNORECASE
)


class BundleRejected(ValueError):
    """A bundle that is not plain project data this engine and library can read."""


def _check_tree(root: Any) -> None:
    stack: list[tuple[Any, int]] = [(root, 0)]
    nodes = 0
    while stack:
        value, depth = stack.pop()
        nodes += 1
        if nodes > MAX_NODES:
            raise BundleRejected("The bundle has too many values")
        if depth > MAX_DEPTH:
            raise BundleRejected("The bundle is nested too deeply")
        if isinstance(value, dict):
            for key, child in value.items():
                if not isinstance(key, str) or key.startswith("__") or len(key) > 128:
                    raise BundleRejected(f"The bundle has a field name that is not allowed: {str(key)[:40]}")
                stack.append((child, depth + 1))
        elif isinstance(value, list):
            stack.extend((child, depth + 1) for child in value)
        elif isinstance(value, str):
            if len(value) > MAX_STRING:
                raise BundleRejected("The bundle carries a text or blob that is too long")
            if CODE_MARKERS.search(value):
                raise BundleRejected("The bundle carries something that looks like code; bundles carry data only")
        elif value is not None and not isinstance(value, bool | int | float):
            raise BundleRejected("The bundle carries a value that is not JSON data")


def _check_library(version: Any) -> None:
    if not isinstance(version, str) or not version:
        raise BundleRejected("The bundle does not say which library it was made with")
    newer = version.isdigit() and LIBRARY_VERSION.isdigit() and int(version) > int(LIBRARY_VERSION)
    if newer or (not version.isdigit() and version != LIBRARY_VERSION):
        raise BundleRejected(
            f"The bundle was made with library {version}; this Icarus has library {LIBRARY_VERSION}. Update Icarus"
        )


def _check_envelope(raw: dict[str, Any]) -> None:
    unknown = set(raw) - ENVELOPE_KEYS
    if unknown:
        raise BundleRejected(f"The bundle has fields Icarus does not know: {', '.join(sorted(unknown))}")
    if raw.get("format") != BUNDLE_FORMAT or raw.get("format_version") not in FORMAT_VERSIONS:
        raise BundleRejected("This is not an Icarus bundle, or its format version is not supported")
    if raw.get("kind") != "project":
        raise BundleRejected("Only whole projects can be remixed")
    if raw.get("contract_version") not in PROJECT_CONTRACTS:
        raise BundleRejected("The bundle's project version is not one this Icarus reads")
    _check_library(raw.get("library_version"))
    lineage = raw.get("lineage", {})
    if not isinstance(lineage, dict) or set(lineage) - {"remix_of"}:
        raise BundleRejected("The bundle's lineage is not in the bundle shape")


def check_bundle(raw: dict[str, Any]) -> Project:
    """The project document inside a community bundle, after checking it is data only, in a version this engine
    reads; the library and the design tests judge it when it becomes a project."""
    _check_tree(raw)
    if len(json.dumps(raw, separators=(",", ":"))) > MAX_BYTES:
        raise BundleRejected(f"The bundle is larger than {MAX_BYTES // (1024 * 1024)} MB")
    _check_envelope(raw)
    try:
        project = Project.model_validate(raw.get("project"))
    except ValidationError as error:
        first = error.errors()[0]
        where = ".".join(str(part) for part in first["loc"])
        message = f"The project in the bundle is not valid at {where or 'its top'}: {first['msg']}"
        raise BundleRejected(message) from error
    for obj in all_objects(project):
        for component in obj.components:
            asset = component.properties.get("asset")
            if component.kind == "skin" and isinstance(asset, AssetValue) and asset.value:
                raise BundleRejected(f"{obj.name} wears an imported model, and bundles do not carry model files yet")
    return project


def unpack_bundle(store: ProjectStore, request: UnpackBundle) -> ProjectState:
    """A new local project from a community bundle, with the creation it came from as its lineage."""
    project = check_bundle(request.bundle)
    return store.create_remix(project, request.name or project.name, request.source)
