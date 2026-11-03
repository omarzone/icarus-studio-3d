from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

MAX_TEST_STARTS = 20
MAX_SHIFTS = 10


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class ObjectShift(_Model):
    """An object of the world moved along the ground for a test, in metres; the project itself never changes."""

    object: str = Field(min_length=1, max_length=64)
    dx: float = Field(ge=-50, le=50)
    dy: float = Field(ge=-50, le=50)


class BehaviorTest(_Model):
    """A fixed scenario a checkpoint is judged on: the same starts and world changes for every brain."""

    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{0,47}$")
    name: str = Field(min_length=1, max_length=60)
    # Start seeds: each one places the body at the same start for every brain tested.
    starts: list[int] = Field(min_length=1, max_length=MAX_TEST_STARTS)
    shifts: list[ObjectShift] = Field(default=[], max_length=MAX_SHIFTS)
    # Share of episodes that must succeed for the test to pass.
    pass_share: float = Field(default=0.8, ge=0, le=1)


class BehaviorTestDraft(_Model):
    """A new test as the desktop or the copilot asks for it; the engine picks its id and start seeds."""

    name: str = Field(min_length=1, max_length=60)
    start_count: int = Field(default=5, ge=1, le=MAX_TEST_STARTS)
    shifts: list[ObjectShift] = Field(default=[], max_length=MAX_SHIFTS)
    pass_share: float = Field(default=0.8, ge=0, le=1)


class BehaviorEpisode(_Model):
    seed: int = Field(ge=0)
    passed: bool
    # How it ended, in words ("Reached the goal", "Fell early").
    ending: str = Field(max_length=120)
    seconds: float = Field(ge=0)
    episode_return: float
    # Ground position of the body's root in metres, at a fixed interval from the start.
    path: list[tuple[float, float]]


class BehaviorTestResult(_Model):
    """One checkpoint judged on one test, measured by MuJoCo: runs/<id>/tests/<step>/<test>.json."""

    test: BehaviorTest
    run_id: str
    step: int = Field(ge=0)
    ran_at: datetime
    passed: bool
    has_goal: bool
    # Seconds between consecutive path points.
    path_interval: float = Field(gt=0)
    passed_share: float = Field(ge=0, le=1)
    fall_share: float = Field(ge=0, le=1)
    mean_seconds: float = Field(ge=0)
    mean_return: float
    # Metres the root travelled along its path, and its straight distance from start to end.
    mean_path_length: float = Field(ge=0)
    mean_displacement: float = Field(ge=0)
    # Ground distance to the goal at the end, for tasks with a goal.
    mean_end_distance: float | None = None
    episodes: list[BehaviorEpisode]


class BehaviorMatchRow(_Model):
    label: str = Field(max_length=60)
    unit: str = Field(max_length=10)
    a: float
    b: float
    close: bool


class BehaviorComparison(_Model):
    """Two checkpoints on the same test: their numbers side by side and how far apart their paths ran."""

    test_id: str
    a: BehaviorTestResult
    b: BehaviorTestResult
    rows: list[BehaviorMatchRow]
    # Mean ground distance in metres between the two brains' bodies at the same time from the same start.
    path_gap: float = Field(ge=0)
    # 1 when they move the same way, falling to 0 as the path gap reaches their mean path length.
    similarity: float = Field(ge=0, le=1)


class CheckpointEpisode(_Model):
    """One evaluation episode of a checkpoint with pass or fail, from runs/<id>/frames/<step>/episodes.json."""

    index: int = Field(ge=0)
    seed: int = Field(ge=0)
    passed: bool
    ending: str = Field(max_length=120)
    seconds: float = Field(ge=0)
    episode_return: float


class NeuronActivity(_Model):
    index: int = Field(ge=0)
    # Mean absolute output over the episode, the largest absolute output, and the share of steps above 0.5.
    mean: float = Field(ge=0)
    peak: float = Field(ge=0)
    active_share: float = Field(ge=0, le=1)


class LayerActivity(_Model):
    name: str = Field(max_length=60)
    size: int = Field(ge=1)
    activation: str = Field(max_length=40)
    neurons: list[NeuronActivity]


class EpisodeActivations(_Model):
    """What every hidden neuron of a checkpoint computed over its recorded evaluation episode, step by step."""

    run_id: str
    step: int = Field(ge=0)
    frames: int = Field(ge=0)
    seconds: float = Field(ge=0)
    outcome: str
    # Whether replaying the episode gave the recorded return, so these are the recording's activations.
    matches_recording: bool
    layers: list[LayerActivity]
