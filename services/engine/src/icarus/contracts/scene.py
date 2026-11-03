from typing import Literal, get_args

from pydantic import BaseModel, ConfigDict

from icarus.contracts.decor import DisplayReading, PlateSignal, SceneDisplay, SceneEyes, ScenePlate

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
    "stairs",
    "step",
    "slab",
    "pillar",
    "planks",
    "speed_bump",
    "wheel_stop",
    "barrier",
    "fence",
    "sign",
    "building",
    "house",
    "garage",
    "table",
    "bench",
    "shelf",
    "bush",
    "rock",
    "barrel",
    "crate_stack",
    "puddle",
    "parked_car",
]
GEOM_STYLES: list[str] = list(get_args(GeomStyle))

# What a part is made of, for its look: roughness, shine and the grain on its face.
GeomSurface = Literal[
    "asphalt",
    "concrete",
    "grass",
    "snow",
    "ice",
    "rubber",
    "wood",
    "metal",
    "plastic",
    "sand",
    "dirt",
    "fabric",
    "stone",
    "glass",
]
GEOM_SURFACES: list[str] = list(get_args(GeomSurface))

# What a part is made of, picked from a palette: it sets the drawn look and, through the surface, the friction.
MaterialPreset = Literal[
    "plastic",
    "smooth_plastic",
    "wood",
    "wood_planks",
    "brick",
    "cobblestone",
    "concrete",
    "metal",
    "diamond_plate",
    "corroded_metal",
    "grass",
    "sand",
    "ground",
    "ice",
    "glass",
    "neon",
    "marble",
    "granite",
    "fabric",
    "foil",
]
MATERIAL_PRESETS: list[str] = list(get_args(MaterialPreset))

# Marks drawn on a ground slab's top: a line grid or raised studs, one per cell; drawing only.
GroundDecal = Literal["grid", "studs"]
GROUND_DECALS: list[str] = list(get_args(GroundDecal))

# Shapes a part can have: MuJoCo primitives, plus wedges built by the engine as convex mesh colliders.
GeomShape = Literal["plane", "box", "sphere", "capsule", "cylinder", "wedge", "corner_wedge"]

# The pattern a part's faces are drawn with; drawing only, never friction (the surface sets that).
GeomFinish = Literal[
    "plain",
    "brick",
    "concrete",
    "asphalt",
    "wood",
    "tiles",
    "painted_metal",
    "glass",
    "grass",
    "fabric",
    "rubber",
    "blocks",
]
GEOM_FINISHES: list[str] = list(get_args(GeomFinish))

# Which vehicle light a part is; the engine says per frame which ones are on (SceneSignals.lights).
LightRole = Literal["brake", "reverse", "head"]
LIGHT_ROLES: list[str] = list(get_args(LightRole))


class SceneBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    parent: str | None
    position: Vector3
    # wxyz, world frame.
    quaternion: Quaternion


class SceneSkin(BaseModel):
    """A 3D model drawn over a part, fitted inside its collider (ADR 008); physics and training never read it."""

    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    # The project that stores the model and the model's id there.
    project: str
    asset: str
    # How much of the collider's box the model fills, 0.1 to 1, after a uniform scale that fits it inside.
    fill: float = 1
    # Shift in metres and turn in degrees (X, then Y, then Z) in the part's frame; the model never leaves the collider.
    offset: Vector3 = (0, 0, 0)
    rotation: Vector3 = (0, 0, 0)


class SceneGeom(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    body: str
    # A wedge rises from its +y edge to full height along its -y edge; a corner wedge peaks over its +x, -y corner.
    shape: GeomShape
    # Full extents in metres (MuJoCo stores half sizes).
    size: Vector3
    position: Vector3
    quaternion: Quaternion
    color: str
    # None draws the plain primitive (also every scene exported before styles existed).
    style: GeomStyle | None = None
    surface: GeomSurface | None = None
    # Drawing only, 0 to 1: how see-through and how mirror-like the part looks. Rays and contacts never read them.
    transparency: float = 0
    reflectance: float = 0
    cast_shadow: bool = True
    # None or plain keeps the look the style and surface give.
    finish: GeomFinish | None = None
    # 0 to 1, where 0.5 keeps the finish's own: lower is glossier or less metallic, higher rougher or more metallic.
    roughness: float = 0.5
    metalness: float = 0.5
    # Glow in the part's color, 0 to 3: lit windows and lamp heads of a style, or the whole part without one.
    emissive: float = 0
    # A 3D model drawn instead of the primitive or style; None draws those.
    skin: SceneSkin | None = None
    # The vehicle light this part is: it glows while the engine reports that light on.
    light_role: LightRole | None = None
    # Radius in metres of a box's rounded edges, drawn inside the collider, which stays a sharp box.
    bevel: float = 0
    # The world's floor: a slab with edges, framed and picked like a ground plane rather than like an obstacle.
    ground: bool = False
    # The palette material the part is made of; None draws it from its finish and surface.
    material: MaterialPreset | None = None
    # Marks on a ground slab's top, with the cell size in metres; None draws none.
    decal: GroundDecal | None = None
    decal_cell: float = 1


class SceneLight(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    position: Vector3
    direction: Vector3
    intensity: float
    # The light's own hue at full strength; None draws white (scenes exported before light colors).
    color: str | None = None
    shadows: bool = True


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


class GoalSignal(BaseModel):
    """Which of the goal zone's success rules hold right now, as the engine measured them."""

    model_config = ConfigDict(extra="forbid")

    # The agent is inside: wholly when the zone asks for it, otherwise its center.
    inside: bool
    # Its heading matches the spot's within the zone's tolerance and entry rule (always true without one).
    aligned: bool
    # Slower than the zone's stop speed.
    stopped: bool
    # Every rule holds: the try succeeds.
    met: bool


class LightSignal(BaseModel):
    """Which vehicle lights are on, from the vehicle's commands and motion."""

    model_config = ConfigDict(extra="forbid")

    brake: bool
    reverse: bool
    head: bool


class SceneSignals(BaseModel):
    """Task and vehicle states the viewport shows on top of the poses; computed by the engine, never guessed."""

    model_config = ConfigDict(extra="forbid")

    # None when the world has no goal zone or no agent.
    goal: GoalSignal | None = None
    # None when the body is not a vehicle.
    lights: LightSignal | None = None
    # Every floor plate's state and every display's value; empty without plates or displays.
    plates: list[PlateSignal] = []
    displays: list[DisplayReading] = []


class SceneSky(BaseModel):
    """How the world's sky and air look; the physics never depends on it."""

    model_config = ConfigDict(extra="forbid")

    top: str
    horizon: str
    # How much light the sky adds everywhere, 0 to 2.
    ambient: float
    # How thick the haze is, 0 for none.
    fog: float
    # Everything below defaults to the look worlds had before it existed.
    # The sun's disc on the sky in degrees across, 0 for none; it sits where the first light shines from.
    sun_size: float = 0
    # Glow around the sun and whitening of the horizon band, 0 to 1.
    glare: float = 0
    haze: float = 0
    # How many stars show once the sky is dark, 0 to 1.
    stars: float = 0
    # How much of the sky clouds cover and how thick they look, 0 to 1.
    clouds: float = 0
    cloud_density: float = 0.7
    cloud_color: str = "#ffffff"
    # Tint of the light the sky adds everywhere.
    ambient_color: str = "#ffffff"
    shadows: bool = True
    # 0 for hard shadow edges, 1 for very soft ones.
    shadow_softness: float = 0.5
    # Stops of exposure before tone mapping: 1 doubles the light, -1 halves it.
    exposure: float = 0
    # Color grading of the final image, each -1 to 1 with 0 unchanged, and a tint it is multiplied by.
    brightness: float = 0
    contrast: float = 0
    saturation: float = 0
    tint: str = "#ffffff"


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
    # Floor plates, digital displays and eyes; empty in scenes exported before they existed.
    plates: list[ScenePlate] = []
    displays: list[SceneDisplay] = []
    eyes: list[SceneEyes] = []
