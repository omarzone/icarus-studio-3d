"""Floor plates, digital displays and eyes in a scene: what the viewport draws for them and the per-frame states the
engine measures (plates pressed, display values). Eyes are look-only and carry no state."""

from typing import Literal, get_args

from pydantic import BaseModel, ConfigDict

Vector3 = tuple[float, float, float]
Quaternion = tuple[float, float, float, float]

# What a plate is for: pressure plates sink under weight, target plates are goals, start pads are striped marks and
# custom plates are any other place to step on.
PlateRole = Literal["pressure", "target", "start", "custom"]
PLATE_ROLES: list[str] = list(get_args(PlateRole))

# Where a display's value comes from; every one but fixed is measured by the engine per frame.
DisplaySource = Literal[
    "episode_time",
    "step",
    "try",
    "training_steps",
    "successes",
    "reward",
    "goal_distance",
    "goal_progress",
    "sensor",
    "plates",
    "fixed",
]
DISPLAY_SOURCES: list[str] = list(get_args(DisplaySource))

DisplayFormat = Literal["integer", "decimal", "time", "text"]
DISPLAY_FORMATS: list[str] = list(get_args(DisplayFormat))

# A digital panel with the value, or a bar filled by the value's share of its full scale.
DisplayStyle = Literal["panel", "bar"]
DISPLAY_STYLES: list[str] = list(get_args(DisplayStyle))

# Where the eyes look: straight out of the face, the way the body moves, or toward the goal.
EyesLook = Literal["ahead", "movement", "goal"]
EYES_LOOKS: list[str] = list(get_args(EyesLook))


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class ScenePlate(_Model):
    """A thin static plate on the floor; the physics sees it as a floor patch, the viewport draws it by role."""

    # The plate's geom ("<object>:plate").
    name: str
    object: str
    role: PlateRole
    shape: Literal["box", "cylinder"]
    # Full extents in metres.
    size: Vector3
    position: Vector3
    quaternion: Quaternion
    color: str
    # Its place in an in-order goal, 0 when it has none.
    order: int = 0
    # How far the drawing sinks while pressed, in metres; drawing only.
    sink: float = 0.01


class SceneAnchor(_Model):
    """The part a display or the eyes sit on: its geom when it has one (they move with it), at its start pose."""

    object: str
    geom: str | None
    position: Vector3
    quaternion: Quaternion
    # Full extents of the part's geom in metres, zero without one.
    size: Vector3 = (0, 0, 0)


class SceneDisplay(_Model):
    """A look-only digital panel on a part that shows a value the engine reports per frame (or a fixed text)."""

    anchor: SceneAnchor
    source: DisplaySource
    format: DisplayFormat
    decimals: int = 0
    # Shown before the value ("TIME", "GEN"); empty for none.
    label: str = ""
    # The fixed value when the source is fixed.
    text: str = ""
    style: DisplayStyle = "panel"
    # The value a bar shows full.
    full_scale: float = 1
    # From the part's center in its own frame, in metres, and which way the panel faces around the part's up axis.
    offset: Vector3 = (0, 0, 0)
    heading: float = 0
    width: float = 1
    # On: the panel always turns to face the camera.
    billboard: bool = False
    color: str = "#ff3b30"


class SceneEyes(_Model):
    """Two cartoon eyes on a part; drawn and blinked by the viewport only, never read by physics or training."""

    anchor: SceneAnchor
    # Each eye's diameter and the distance between their centers, in metres.
    size: float
    spacing: float
    # How far up from the part's center the eyes sit, in metres.
    height: float = 0
    # Which side of the part they face, in degrees around its up axis; 0 is its forward (+X) side.
    facing: float = 0
    color: str = "#111111"
    white: str = "#ffffff"
    # Seconds between blinks and how much each gap varies, 0 to 1.
    blink_interval: float = 3
    blink_jitter: float = 0.5
    look: EyesLook = "ahead"


class PlateSignal(_Model):
    """One plate's state at a frame, measured on MuJoCo's contacts and positions."""

    object: str
    # What the plate watches pushes on it with at least its press force.
    pressed: bool
    # What it watches has its center over the plate.
    occupied: bool
    # Its trigger holds (pressed or occupied, by the plate's setting): the plate lights up.
    active: bool
    # It has triggered during this try (in order, when the goal asks for order).
    reached: bool


class DisplayReading(_Model):
    """A display's value at a frame; None when the engine has nothing to show (no goal, no sensor, no training)."""

    object: str
    value: float | None
