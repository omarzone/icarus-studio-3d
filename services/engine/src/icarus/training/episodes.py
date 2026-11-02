from pydantic import BaseModel, ConfigDict

# Locomotion has no goal zone: an episode counts as walking when the body stays up and moves this far forward.
LOCOMOTION_DISTANCE = 3.0
# Episodes that end before this, without reaching the goal, ended on the spot.
INSTANT_SECONDS = 1.0


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
