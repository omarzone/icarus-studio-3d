from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.project import RemixOrigin


class UnpackBundle(BaseModel):
    """A community bundle to turn into a new local project, with the creation it was downloaded from."""

    model_config = ConfigDict(extra="forbid")

    # The bundle as the community serves it: an `icarus.bundle` envelope around a project document.
    bundle: dict[str, Any]
    source: RemixOrigin
    # The new project's name; the bundle's project name when left out.
    name: str | None = Field(default=None, min_length=1, max_length=80)
