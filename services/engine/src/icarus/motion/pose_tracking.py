"""Tracking a clip: every frame goes to the pose model, the person the clip copies is picked from what it found, and
the clip keeps their keypoints frame by frame."""

import threading
from collections.abc import Callable

from icarus.contracts.motion import Keypoint, MotionClip, MotionTracking, PersonPose, PersonRule, TrackedFrame
from icarus.copilot.client import ModelClient
from icarus.copilot.pose import estimate_pose
from icarus.motion.clip_store import ClipStore

NO_POSE_MODEL = "Connect a pose model in Settings › AI models to track motion from a video"
# Keypoints the model is less sure of than this are treated as unseen.
MIN_SCORE = 0.3


class TrackingBoard:
    """The latest tracking of each clip, as it runs; kept in memory by the API process."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._status: dict[str, MotionTracking] = {}

    def set(self, status: MotionTracking) -> MotionTracking:
        with self._lock:
            self._status[status.clip] = status
        return status

    def get(self, clip_id: str) -> MotionTracking | None:
        with self._lock:
            return self._status.get(clip_id)

    def update(self, clip_id: str, **changes: object) -> None:
        with self._lock:
            current = self._status.get(clip_id)
            if current is not None:
                self._status[clip_id] = current.model_copy(update=changes)


def _seen(person: PersonPose) -> list[Keypoint]:
    """The person's keypoints the model is sure enough of, each name once."""
    kept: dict[str, Keypoint] = {}
    for keypoint in person.keypoints:
        if keypoint.score >= MIN_SCORE and keypoint.name not in kept:
            kept[keypoint.name] = keypoint
    return list(kept.values())


def _size(points: list[Keypoint]) -> float:
    if len(points) < 2:
        return 0.0
    xs, ys = [point.x for point in points], [point.y for point in points]
    return (max(xs) - min(xs)) * (max(ys) - min(ys))


def _center(points: list[Keypoint]) -> float:
    return sum(point.x for point in points) / len(points) if points else 0.5


def pick_person(people: list[PersonPose], rule: PersonRule) -> list[Keypoint]:
    """The keypoints of the person the rule picks: the biggest in the picture, or the leftmost or rightmost."""
    seen = [points for points in (_seen(person) for person in people) if points]
    if not seen:
        return []
    match rule:
        case "largest":
            return max(seen, key=_size)
        case "left":
            return min(seen, key=_center)
        case "right":
            return max(seen, key=_center)


def track_clip(
    clips: ClipStore,
    board: TrackingBoard,
    client: ModelClient,
    project_id: str,
    clip: MotionClip,
    check: Callable[[], None],
) -> MotionClip:
    """Send every frame to the pose model and keep the copied person's keypoints in the clip."""
    frames: list[TrackedFrame] = []
    most = 0
    count = clip.video.frames
    for index in range(count):
        check()
        board.update(clip.id, frame=index)
        picture, media = clips.frame(project_id, clip.id, index)
        estimate = estimate_pose(client, picture, media, index, count)
        most = max(most, len(estimate.people))
        time = round(index / clip.video.fps, 4)
        frames.append(TrackedFrame(time=time, keypoints=pick_person(estimate.people, clip.person)))
    tracked = clip.model_copy(update={"frames": frames, "people": most})
    clips.save(project_id, tracked)
    board.update(clip.id, frame=count, state="done")
    return tracked
