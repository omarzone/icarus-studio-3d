"""Motion from a reference video: the pose model's answer, the tracked clip, the reference a body imitates and what
training it produced (ADR 015)."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

KeypointName = Literal[
    "head",
    "neck",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
]
# A limb between two keypoints; its direction in the view plane is what a body imitates.
SegmentName = Literal[
    "torso",
    "head",
    "left_upper_arm",
    "left_forearm",
    "right_upper_arm",
    "right_forearm",
    "left_thigh",
    "left_shin",
    "right_thigh",
    "right_shin",
]
# How the video sees the person: from the side (forward is across the picture) or from the front.
MotionView = Literal["side", "front"]
# Which person of the video to copy, when the pose model finds several.
PersonRule = Literal["largest", "left", "right"]
MAX_MOTION_FRAMES = 240
Share = Annotated[float, Field(ge=0, le=1)]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Keypoint(_Model):
    name: KeypointName
    # Position in the picture as a share of its width and height, from the top left corner.
    x: Share
    y: Share
    # How sure the model is that the point is where it says.
    score: Share = 1.0


class PersonPose(_Model):
    keypoints: list[Keypoint] = Field(max_length=32)


class PoseEstimate(_Model):
    """What the `pose` capability answers for one picture: every person it sees with their keypoints."""

    people: list[PersonPose] = Field(max_length=8)


class MotionVideoUpload(_Model):
    """A reference video the app sampled into still frames at an even rate; the video file itself stays on the
    person's computer."""

    name: str = Field(min_length=1, max_length=200)
    # Seconds of the whole video, and of the part the frames cover.
    duration: float = Field(gt=0, le=3600)
    start: float = Field(default=0, ge=0)
    # Frames per second the frames were taken at.
    fps: float = Field(gt=0, le=60)
    width: int = Field(ge=1, le=10_000)
    height: int = Field(ge=1, le=10_000)
    # Base64 JPEG or PNG pictures, in order.
    frames: list[str] = Field(min_length=2, max_length=MAX_MOTION_FRAMES)


class MotionChoice(_Model):
    """Who to copy, onto which body and how the video sees them; fields left out keep their value."""

    person: PersonRule | None = None
    target: str | None = None
    view: MotionView | None = None


class TrackedFrame(_Model):
    time: float = Field(ge=0)
    # The copied person's keypoints; empty when the model found nobody in this frame.
    keypoints: list[Keypoint]


class MotionVideo(_Model):
    name: str
    duration: float
    start: float
    fps: float
    width: int
    height: int
    frames: int = Field(ge=0)


class MotionClip(_Model):
    """A reference video of a project, its choices and, once tracked, the copied person's pose in every frame."""

    id: str
    video: MotionVideo
    person: PersonRule = "largest"
    # The body that copies it; None until the project has one.
    target: str | None = None
    view: MotionView = "side"
    # Empty until the pose is tracked.
    frames: list[TrackedFrame] = []
    # People the model saw in the frame it saw the most in.
    people: int = Field(default=0, ge=0)
    created_at: datetime


TrackingState = Literal["idle", "running", "done", "failed", "stopped"]


class MotionTracking(_Model):
    """Pose tracking of a clip as it runs: the frame being read and how it ended."""

    clip: str
    state: TrackingState
    frame: int = Field(ge=0)
    frames: int = Field(ge=0)
    # The pose model's name, None when no pose model is connected.
    model: str | None
    # Why it failed or stopped, in words.
    message: str | None = None


class SegmentTrack(_Model):
    segment: SegmentName
    # The body part that imitates this segment.
    part: str = Field(min_length=1, max_length=64)
    # The segment's direction in the view plane per reference frame, radians from forward-right counterclockwise;
    # None where the video did not show it.
    angles: list[float | None]


class MotionReference(_Model):
    """The motion an imitation task tracks, frozen in the project so every run keeps the reference it learned."""

    clip: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    fps: float = Field(gt=0, le=60)
    view: MotionView
    tracks: list[SegmentTrack] = Field(min_length=1, max_length=10)
    # Share of the clip where more tries start, the moment it practices more; None practices it evenly.
    focus: tuple[Share, Share] | None = None


class PartMatch(_Model):
    segment: SegmentName
    part: str
    # How closely the trained body matched this segment over the clip, 0 to 1.
    match: Share


class MotionComparison(_Model):
    """The reference against what a trained brain did with it, measured on its latest evaluation episode."""

    clip: str
    run_id: str
    run_name: str
    step: int = Field(ge=0)
    fps: float
    segments: list[SegmentName]
    # Per frame, each segment's angle in the reference and in the physics result (None where it is not known).
    reference: list[list[float | None]]
    result: list[list[float | None]]
    # Per frame, how closely the whole body matched, 0 to 1.
    match: list[Share]
    parts: list[PartMatch]
    # Mean match over the clip, and the share of the clip where the worst second starts.
    overall: Share
    weakest: Share


class MotionWorkspace(_Model):
    """Everything the motion workspace shows for a project: its clip, the tracking, the pose model and the latest
    comparison."""

    clip: MotionClip | None
    tracking: MotionTracking | None
    # The pose model's name, None when no pose model is connected in Settings.
    pose_model: str | None
    # The reference the project's task imitates, when it has one.
    reference: MotionReference | None
    comparison: MotionComparison | None
    # The latest run that imitates this clip, when there is one.
    run_id: str | None = None


class MotionTrain(_Model):
    """Start training a body to imitate the tracked clip."""

    focus: Literal["even", "weakest"] = "even"
    total_steps: int | None = Field(default=None, ge=10_000, le=50_000_000)
    copies: int | None = Field(default=None, ge=1, le=256)
    # Continue from the latest imitation run's best brain.
    warm: bool = False


ExportFormat = Literal["json", "bvh"]


class MotionExportRequest(_Model):
    format: ExportFormat = "json"
    # The physics result of the latest run, or the tracked reference.
    source: Literal["physics", "reference"] = "physics"
    root_motion: bool = True
    loop: bool = False


class MotionExportFile(_Model):
    name: str
    media_type: str
    content: str
    frames: int = Field(ge=0)
