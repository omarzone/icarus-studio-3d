import hashlib
import json
import re
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

BUNDLE_FORMAT = "icarus.bundle"
SUPPORTED_FORMAT_VERSIONS = {1}
SUPPORTED_PROJECT_SCHEMAS = {1}
PROJECT_KEYS = {"id", "name", "description", "schema_version", "world", "bodies", "task", "brain", "agents"}
REQUIRED_PROJECT_KEYS = {"id", "name", "schema_version", "world", "bodies", "task", "brain"}
MAX_DEPTH = 48
MAX_NODES = 250_000
MAX_STRING = 20_000
KEY_PATTERN = re.compile(r"^[^\x00-\x1f]{1,128}$")
# A string that carries a script or a program instead of describing something.
CODE_MARKERS = re.compile(
    r"<script|javascript:|\bdata:(?!image/(png|jpeg|webp)[;,])[a-z]+/[a-z0-9.+-]+[;,]|^#!", re.IGNORECASE
)


class BundleRejected(ValueError):
    pass


class Lineage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    remix_of: str | None = Field(default=None, max_length=32)


class BundleEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    format: str
    format_version: int
    kind: str
    contract_version: str = Field(min_length=1, max_length=32)
    library_version: str = Field(min_length=1, max_length=32)
    created_with: str = Field(default="", max_length=80)
    lineage: Lineage = Field(default_factory=Lineage)
    project: dict[str, Any]


@dataclass(frozen=True)
class CheckedBundle:
    data: bytes
    sha256: str
    envelope: BundleEnvelope


def check_bundle(raw: Any, max_bytes: int) -> CheckedBundle:
    """A shareable project is plain JSON data in a known shape; anything else (code, archives, blobs) is refused."""
    if not isinstance(raw, dict):
        raise BundleRejected("A bundle is a JSON object")
    _check_tree(raw)
    try:
        envelope = BundleEnvelope.model_validate(raw)
    except ValidationError as error:
        raise BundleRejected(f"The bundle does not have the bundle shape: {error.errors()[0]['msg']}") from error
    if envelope.format != BUNDLE_FORMAT or envelope.format_version not in SUPPORTED_FORMAT_VERSIONS:
        raise BundleRejected("This bundle format or version is not supported")
    if envelope.kind != "project":
        raise BundleRejected("Only whole projects can be published for now")
    _check_project(envelope.project)
    data = json.dumps(raw, separators=(",", ":"), sort_keys=True, ensure_ascii=False).encode()
    if len(data) > max_bytes:
        raise BundleRejected(f"The bundle is larger than {max_bytes // (1024 * 1024)} MB")
    return CheckedBundle(data=data, sha256=hashlib.sha256(data).hexdigest(), envelope=envelope)


def _check_project(project: dict[str, Any]) -> None:
    unknown = set(project) - PROJECT_KEYS
    if unknown:
        raise BundleRejected(f"The project has fields Icarus does not know: {', '.join(sorted(unknown))}")
    missing = REQUIRED_PROJECT_KEYS - set(project)
    if missing:
        raise BundleRejected(f"The project is missing {', '.join(sorted(missing))}")
    if project["schema_version"] not in SUPPORTED_PROJECT_SCHEMAS:
        raise BundleRejected("This project version is not supported")
    if not isinstance(project["name"], str) or not isinstance(project["id"], str):
        raise BundleRejected("The project needs a name and an id")
    for section in ("world", "task", "brain"):
        if not isinstance(project[section], dict):
            raise BundleRejected(f"The project's {section} must be an object")
    if not isinstance(project["bodies"], list):
        raise BundleRejected("The project's bodies must be a list")


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
                if not isinstance(key, str) or not KEY_PATTERN.match(key) or key.startswith("__"):
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
