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


class SceneDescription(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision: int
    bodies: list[SceneBody]
    geoms: list[SceneGeom]
    lights: list[SceneLight]
