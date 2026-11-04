from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.copilot import MAX_ATTACHMENT_CHARS


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class RobotFile(_Model):
    """One picked file of a robot: its URDF or MJCF description, a file it includes or a mesh it uses."""

    # Only the file name counts: every file of a robot is looked up by name, whatever folder it came from.
    name: str = Field(min_length=1, max_length=200)
    # The file itself, base64.
    data: str = Field(max_length=MAX_ATTACHMENT_CHARS)


class RobotImport(_Model):
    """A URDF or MJCF robot the person picked with its meshes, to become the project's body."""

    files: list[RobotFile] = Field(min_length=1, max_length=200)
    # The description to read; None picks the one .urdf, or the one .xml no other picked file includes.
    main: str | None = Field(default=None, max_length=200)


class RobotImported(_Model):
    # The body made from the robot, and the revision that added it.
    body: str
    name: str
    format: Literal["urdf", "mjcf"]
    parts: int = Field(ge=0)
    joints: int = Field(ge=0)
    motors: int = Field(ge=0)
    revision: int
    # What the import changed to fit the library, in words (a mesh collider became a box, a motor was added).
    notes: list[str]
