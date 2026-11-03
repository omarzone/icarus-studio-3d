from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.scene import Quaternion, SceneRay, SceneSignals, Vector3

MAX_STEPS = 50_000_000
MAX_COPIES = 64


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class WarmStart(_Model):
    """Continue from a brain that already learned, instead of from zero; it must see and act the same way."""

    run_id: str
    step: int = Field(ge=0)


class StartRun(_Model):
    """What the desktop or the copilot asks for when it starts training the current revision."""

    total_steps: int = Field(ge=10_000, le=MAX_STEPS)
    copies: int = Field(ge=1, le=MAX_COPIES)
    seed: int | None = Field(default=None, ge=0)
    warm_start: WarmStart | None = None
    # The copilot comments at checkpoints and diagnoses when the run goes wrong.
    coach: bool = False


class RunConfig(_Model):
    """Frozen in run.json when a run starts."""

    run_id: str
    project_id: str
    revision_number: int = Field(ge=1)
    seed: int = Field(ge=0)
    total_steps: int = Field(ge=10_000, le=MAX_STEPS)
    copies: int = Field(ge=1, le=MAX_COPIES)
    # Steps at which a checkpoint is saved and evaluated; 0 is the untrained brain.
    checkpoint_steps: list[int]
    evaluation_episodes: int = Field(ge=1)
    threads: int = Field(ge=1)
    warm_start: WarmStart | None = None
    # In a project with several agents: the agent this run trains and the group of runs started with it.
    agent: str | None = None
    group: str | None = None


RunState = Literal["starting", "running", "stopping", "done", "stopped", "failed"]
# What a running worker is doing: stepping the copies, updating the brain from them, or testing a checkpoint.
RunPhase = Literal["practicing", "updating", "testing"]
# How the live view plays the copies: one pose per snapshot eased ("classic"), recorded motion at 1x sim speed a
# moment behind ("realtime"), or recorded motion sped up to keep pace with training ("fast").
LiveViewMode = Literal["classic", "realtime", "fast"]


class RunFailure(_Model):
    # One plain sentence a person can act on.
    reason: str
    # Technical lines from the worker log.
    details: list[str]


class RunStatus(_Model):
    run_id: str
    project_id: str
    revision_number: int
    # The run's name in the project ("Run 3").
    name: str
    state: RunState
    step: int = Field(ge=0)
    total_steps: int
    copies: int
    steps_per_second: float = Field(ge=0)
    started_at: datetime
    finished_at: datetime | None = None
    # The checkpoint with the best evaluation so far.
    best_step: int | None = None
    # Evaluation of the latest checkpoint: share of episodes that reached the goal, when the task has one.
    success_rate: float | None = None
    failure: RunFailure | None = None
    # Only while the worker runs; old status files have none.
    phase: RunPhase | None = None
    # The checkpoint being tested while `phase` is "testing".
    testing_step: int | None = None
    # In a project with several agents: the agent this run trains, its name and the group of runs started together.
    agent: str | None = None
    agent_name: str | None = None
    group: str | None = None
    # The worker holds training where it was until the run is resumed.
    paused: bool = False


class RunGroup(_Model):
    """The runs started together for a project with several agents, one per agent, in the agents' order."""

    group_id: str
    project_id: str
    revision_number: int
    runs: list[RunStatus]


class MetricPoint(_Model):
    """One line of metrics.jsonl: training episodes since the previous point, or one checkpoint's evaluation."""

    kind: Literal["train", "eval"]
    step: int = Field(ge=0)
    # Seconds since the run started.
    elapsed: float = Field(ge=0)
    episode_return: float
    episode_length: float
    # Share of episodes that reached the goal, for tasks with a goal.
    success_rate: float | None = None
    # Share of episodes that ended in a collision or a fall.
    failure_rate: float | None = None
    # Mean return of each reward term over the episodes, by term id.
    reward_terms: dict[str, float]
    steps_per_second: float | None = None


class CheckpointInfo(_Model):
    step: int = Field(ge=0)
    episode_return: float
    success_rate: float | None = None
    failure_rate: float | None = None
    has_rollout: bool


class RolloutFrame(_Model):
    time: float
    # One per geom, in the order of Rollout.geoms.
    positions: list[Vector3]
    quaternions: list[Quaternion]
    reward: float
    # Goal and light states at this frame; absent in rollouts recorded before they existed.
    signals: SceneSignals | None = None


class Rollout(_Model):
    """The first deterministic evaluation episode of a checkpoint, replayed exactly as MuJoCo computed it."""

    step: int
    seed: int
    geoms: list[str]
    frames: list[RolloutFrame]
    episode_return: float
    # How it ended, in words ("Reached the parking spot at 12.4 s", "Touched Wall at 3.1 s", "Time ran out").
    outcome: str


class CopyPoses(_Model):
    positions: list[Vector3]
    quaternions: list[Quaternion]
    # This copy's distance sensors right now.
    rays: list[SceneRay] = []
    # This copy's goal and light states right now.
    signals: SceneSignals | None = None


class MotionSegment(_Model):
    """Contiguous recorded frames of one episode of one copy, as MuJoCo computed them."""

    # Counts this copy's episodes; a new number is a cut, never motion to blend across.
    episode: int
    # Seconds of sim time since the episode started, increasing.
    times: list[float]
    frames: list[CopyPoses]


class TrainingSnapshot(_Model):
    """The parallel copies as they are right now, sampled a few times per second while a run trains."""

    step: int
    geoms: list[str]
    # Each copy's newest pose.
    copies: list[CopyPoses]
    # Absent in snapshots written before the live view played recorded motion; those are "classic".
    live_view: LiveViewMode | None = None
    # Per copy, the frames recorded since the previous snapshot, oldest first.
    motion: list[list[MotionSegment]] | None = None


class LogLine(_Model):
    elapsed: float
    level: Literal["info", "warn", "error"]
    text: str


class StatusEvent(_Model):
    type: Literal["status"]
    status: RunStatus


class MetricEvent(_Model):
    type: Literal["metric"]
    metric: MetricPoint


class CheckpointEvent(_Model):
    type: Literal["checkpoint"]
    checkpoint: CheckpointInfo


class SnapshotEvent(_Model):
    type: Literal["snapshot"]
    snapshot: TrainingSnapshot


class LogEvent(_Model):
    type: Literal["log"]
    line: LogLine


RunEvent = Annotated[
    StatusEvent | MetricEvent | CheckpointEvent | SnapshotEvent | LogEvent,
    Field(discriminator="type"),
]


class RunEventEnvelope(_Model):
    """One server-sent event of GET /runs/{id}/events."""

    event: RunEvent


class TrainingSettings(_Model):
    threads: int = Field(ge=1)
    max_threads: int = Field(ge=1)
    use_graphics_card: bool
    # The detected graphics card, or none on CPU-only machines.
    graphics_card: str | None
    projects_folder: str
    runs_folder: str


class TrainingSettingsPatch(_Model):
    threads: int | None = Field(default=None, ge=1)
    use_graphics_card: bool | None = None
