from typing import Literal, get_args

from pydantic import BaseModel, ConfigDict

Vector3 = tuple[float, float, float]
Quaternion = tuple[float, float, float, float]

# How a part is drawn; the physics only ever sees its primitive shape, which the drawing stays inside.
GeomStyle = Literal[
    "plain",
    "car_body",
    "wheel",
    "shell",
    "joint",
    "crate",
    "wall",
    "post",
    "cone",
    "ball",
    "lamp_post",
    "curb",
    "marking",
    "tree",
]
GEOM_STYLES: list[str] = list(get_args(GeomStyle))

# What a part is made of, for its look: roughness, shine and the grain on its face.
GeomSurface = Literal["asphalt", "concrete", "grass", "snow", "ice", "rubber", "wood", "metal"]
GEOM_SURFACES: list[str] = list(get_args(GeomSurface))


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
    # None draws the plain primitive (also every scene exported before styles existed).
    style: GeomStyle | None = None
    surface: GeomSurface | None = None


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


class SceneSky(BaseModel):
    """How the world's sky and air look; the physics never depends on it."""

    model_config = ConfigDict(extra="forbid")

    top: str
    horizon: str
    # How much light the sky adds everywhere, 0 to 2.
    ambient: float
    # How thick the haze is, 0 for none.
    fog: float


class SceneRay(BaseModel):
    """Where a distance sensor looks and what it reads, as MuJoCo computed it; the renderer only draws it."""

    model_config = ConfigDict(extra="forbid")

    # The reading id, the same as in Play's senses ("car:ray2").
    sensor: str
    label: str
    origin: Vector3
    # Unit vector in the world frame.
    direction: Vector3
    range: float
    # None when nothing is within range.
    distance: float | None


class SceneDescription(BaseModel):
    model_config = ConfigDict(extra="forbid")

    revision: int
    bodies: list[SceneBody]
    geoms: list[SceneGeom]
    lights: list[SceneLight]
    zones: list[SceneZone] = []
    # None when the world has no sky object; the viewport then uses its default look.
    sky: SceneSky | None = None
    # Distance sensors at the initial pose.
    rays: list[SceneRay] = []
