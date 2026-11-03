from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.scene import Quaternion, SceneDescription, SceneRay, SceneSignals, Vector3

# Commands stay inside a world the size of the editor's; anything beyond is a mistake, not physics.
WORLD_LIMIT = 1000.0
Bounded = Annotated[float, Field(ge=-WORLD_LIMIT, le=WORLD_LIMIT)]
Place = tuple[Bounded, Bounded, Bounded]
Direction = tuple[
    Annotated[float, Field(ge=-1, le=1)], Annotated[float, Field(ge=-1, le=1)], Annotated[float, Field(ge=-1, le=1)]
]
WindSpeed = Annotated[float, Field(ge=-50, le=50)]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class MoveCommand(_Model):
    tool: Literal["move"]
    object: str
    # World position in metres.
    position: Place


class PushCommand(_Model):
    tool: Literal["push"]
    object: str
    # World direction of the push; the engine normalizes it.
    direction: Direction
    # Speed the push gives the object, in m/s; the engine turns it into an impulse with the object's mass.
    speed: float = Field(gt=0, le=20)


class AddObjectCommand(_Model):
    tool: Literal["add_object"]
    # A library piece id.
    piece: str
    position: Place


class LightCommand(_Model):
    tool: Literal["light"]
    intensity: float = Field(ge=0, le=5)


class WindCommand(_Model):
    tool: Literal["wind"]
    # World wind velocity in m/s.
    velocity: tuple[WindSpeed, WindSpeed, WindSpeed]


class SpeedCommand(_Model):
    tool: Literal["speed"]
    # Simulated seconds per real second.
    speed: float = Field(ge=0.1, le=4)


class PauseCommand(_Model):
    tool: Literal["pause"]
    paused: bool


class ResetCommand(_Model):
    tool: Literal["reset"]


class ShuffleCommand(_Model):
    tool: Literal["shuffle"]


class TouchCommand(_Model):
    tool: Literal["touch"]
    # The body part that is poked; it must carry a touch sensor.
    object: str


PlayCommand = Annotated[
    MoveCommand
    | PushCommand
    | AddObjectCommand
    | LightCommand
    | WindCommand
    | SpeedCommand
    | PauseCommand
    | ResetCommand
    | ShuffleCommand
    | TouchCommand,
    Field(discriminator="tool"),
]


class PlayGeomPose(_Model):
    name: str
    position: Vector3
    quaternion: Quaternion


class PlayReading(_Model):
    """One live sensor reading or brain output, with the range it is shown against."""

    id: str
    label: str
    value: float
    min: float
    max: float
    unit: str | None = None


class PlayStatus(_Model):
    title: str
    detail: str


class PlayFrame(_Model):
    time: float
    step: int
    speed: float
    paused: bool
    geoms: list[PlayGeomPose]
    senses: list[PlayReading]
    actions: list[PlayReading]
    reward: float
    episode_return: float
    status: PlayStatus
    rays: list[SceneRay] = []
    signals: SceneSignals | None = None


class PlayEvent(_Model):
    time: float
    kind: Literal["user", "agent", "world"]
    text: str


class PlayToolInfo(_Model):
    id: str
    label: str


class PlaySessionInfo(_Model):
    project_id: str
    revision_number: int
    # Which brain is playing, in words ("Untrained brain: random actions").
    brain: str
    # The run and checkpoint of the trained brain playing; none for the untrained brain.
    run_id: str | None = None
    step: int | None = None
    tools: list[PlayToolInfo]
    scene: SceneDescription


class PlayBrainOption(_Model):
    """A trained brain Play can use: the best checkpoint of one ended run of the project."""

    run_id: str
    step: int
    revision_number: int
    # In words ("Run 3 · 500k steps · revision 12 · 80% success").
    label: str
    success_rate: float | None = None
    # Whether its senses and motors match the body as it is now.
    fits: bool
    # Why it cannot play, when it does not fit ("The body changed: 41 senses now, 37 then").
    reason: str | None = None
    # The brain Play picks when none is chosen.
    default: bool


class PlayReady(_Model):
    type: Literal["ready"]
    session: PlaySessionInfo


class PlayFrameMessage(_Model):
    type: Literal["frame"]
    frame: PlayFrame


class PlayEventMessage(_Model):
    type: Literal["event"]
    event: PlayEvent


class PlayErrorMessage(_Model):
    type: Literal["error"]
    message: str


# What the engine sends over the Play WebSocket.
PlayMessage = Annotated[
    PlayReady | PlayFrameMessage | PlayEventMessage | PlayErrorMessage,
    Field(discriminator="type"),
]


class PlayCommandEnvelope(_Model):
    """What the desktop sends over the Play WebSocket: one command."""

    command: PlayCommand


class PlayMessageEnvelope(_Model):
    message: PlayMessage
