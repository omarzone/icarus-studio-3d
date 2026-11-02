from pydantic import BaseModel, ConfigDict

# Locomotion has no goal zone: an episode counts as walking when the body stays up and moves this far forward.
LOCOMOTION_DISTANCE = 3.0
# Episodes that end before this, without reaching the goal, ended on the spot.
INSTANT_SECONDS = 1.0


class FootSignal(BaseModel):
    """How one foot of the body met the ground during an episode."""

    model_config = ConfigDict(extra="forbid")

    name: str
    # Share of control steps the foot touched something outside the body.
    contact_share: float
    # Times the foot left the ground and later landed again.
    lift_offs: int


class GaitSignals(BaseModel):
    """How a legged body moved during one evaluation episode, measured by MuJoCo at every control step."""

    model_config = ConfigDict(extra="forbid")

    # Height of the body's root in metres: its mean, standard deviation and value when the world was built.
    height_mean: float
    height_spread: float
    start_height: float
    # Mean angle of the root's up axis from vertical and of its forward axis from +x, in degrees.
    tilt_mean: float
    turn_mean: float
    # Mean speed along +x in m/s, and metres moved sideways (along y) from the start.
    forward_speed: float
    drift: float
    # The feet found by the foot rule in sim/gait.py; empty when the body has none.
    feet: list[FootSignal] = []
    # Share of steps with at least one foot in the air, and with every foot in the air at once.
    airborne_share: float = 0.0
    flight_share: float = 0.0
    # Share of limited-joint readings pressed against an end of their range.
    joints_at_limits: float = 0.0
    # Mean absolute change of each normalized (-1..1) action between consecutive steps.
    action_change: float = 0.0


class EpisodeRecord(BaseModel):
    """How one evaluation episode of a checkpoint went, measured by MuJoCo; the data failure groups come from."""

    model_config = ConfigDict(extra="forbid")

    index: int
    seed: int
    success: bool
    fell: bool
    # The first object outside the body it touched, by name, and when.
    touched: str | None = None
    touched_at: float | None = None
    seconds: float
    episode_return: float
    # Ground distance to the goal at the start and at the end, for tasks with a goal.
    start_distance: float | None = None
    end_distance: float | None = None
    # Metres moved along +x, the direction forward progress rewards.
    forward: float
    # How the body moved; absent for runs recorded before gait signals existed and for bodies without joints.
    gait: GaitSignals | None = None
    # Pictures of the episode in the checkpoint's frames folder, in time order, and the 2x2 sheet of them.
    frames: list[str] = []
    sheet: str | None = None


class CheckpointEpisodes(BaseModel):
    """Every evaluation episode of one checkpoint: runs/<id>/frames/<step>/episodes.json."""

    model_config = ConfigDict(extra="forbid")

    step: int
    has_goal: bool
    episode_seconds: float
    episodes: list[EpisodeRecord]


def walked(record: EpisodeRecord) -> bool:
    return not record.fell and record.forward >= LOCOMOTION_DISTANCE


def succeeded(record: EpisodeRecord, has_goal: bool) -> bool:
    """Reached the goal; for locomotion, which has no goal, stayed up and walked LOCOMOTION_DISTANCE forward."""
    return record.success if has_goal else walked(record)


def success_share(episodes: CheckpointEpisodes) -> float:
    if not episodes.episodes:
        return 0.0
    return sum(succeeded(record, episodes.has_goal) for record in episodes.episodes) / len(episodes.episodes)


def instant_share(episodes: CheckpointEpisodes) -> float:
    if not episodes.episodes:
        return 0.0
    instant = [not record.success and record.seconds < INSTANT_SECONDS for record in episodes.episodes]
    return sum(instant) / len(instant)
