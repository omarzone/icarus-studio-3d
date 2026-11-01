from typing import Literal

from pydantic import BaseModel, ConfigDict

Vector3 = tuple[float, float, float]
Quaternion = tuple[float, float, float, float]


class SceneBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    parent: str | None
    position: Vector3
    # wxyz, world frame.
    quaternion: Quaternion


class SceneGeom(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    body: str
    shape: Literal["plane", "box", "sphere", "capsule", "cylinder"]
    # Full extents in metres (MuJoCo stores half sizes).
    size: Vector3
    position: Vector3
    quaternion: Quaternion
    color: str


class SceneLight(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    position: Vector3
    direction: Vector3
    intensity: float


class SceneZone(BaseModel):
    """A place in the world the task uses: where the agent starts, where it must go, or a marked area."""

    model_config = ConfigDict(extra="forbid")

    name: str
    # The object that carries the zone.
    object: str
    kind: Literal["spawn_point", "goal_zone", "zone"]
    shape: Literal["sphere", "box"]
    # Full extents in metres.
    size: Vector3
    position: Vector3
    quaternion: Quaternion


class SceneDescription(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision: int
    bodies: list[SceneBody]
    geoms: list[SceneGeom]
    lights: list[SceneLight]
    zones: list[SceneZone] = []
