"""Retargeting: a tracked clip becomes the reference a body imitates. Each limb of the person (a segment between two
keypoints) is matched to a part of the body by its name and side, and its direction in the picture is kept frame by
frame. Only directions in the picture's plane transfer: depth, twist and the hands' and feet's detail do not."""

import math
import re
from typing import get_args

import mujoco
import numpy as np

from icarus.contracts.motion import Keypoint, MotionClip, MotionReference, SegmentName, SegmentTrack, TrackedFrame
from icarus.contracts.project import Project
from icarus.contracts.specs import BodySpec
from icarus.design.compiler import CompiledModel, compile_project
from icarus.sim.motion_tracking import MotionTracker

SEGMENTS: tuple[SegmentName, ...] = get_args(SegmentName)
# The keypoints each segment runs between, from its joint to its far end; "hips" is between the two hips.
SEGMENT_POINTS: dict[SegmentName, tuple[str, str]] = {
    "torso": ("hips", "neck"),
    "head": ("neck", "head"),
    "left_upper_arm": ("left_shoulder", "left_elbow"),
    "left_forearm": ("left_elbow", "left_wrist"),
    "right_upper_arm": ("right_shoulder", "right_elbow"),
    "right_forearm": ("right_elbow", "right_wrist"),
    "left_thigh": ("left_hip", "left_knee"),
    "left_shin": ("left_knee", "left_ankle"),
    "right_thigh": ("right_hip", "right_knee"),
    "right_shin": ("right_knee", "right_ankle"),
}
SEGMENT_LABELS: dict[SegmentName, str] = {
    "torso": "Torso",
    "head": "Head",
    "left_upper_arm": "Left upper arm",
    "left_forearm": "Left forearm",
    "right_upper_arm": "Right upper arm",
    "right_forearm": "Right forearm",
    "left_thigh": "Left thigh",
    "left_shin": "Left shin",
    "right_thigh": "Right thigh",
    "right_shin": "Right shin",
}
# Words in a part's name or id that say which limb it is, most specific first.
_KINDS: list[tuple[str, tuple[str, ...]]] = [
    ("forearm", ("forearm", "lower arm", "lower_arm", "elbow")),
    ("upper_arm", ("upper arm", "upper_arm", "shoulder", "arm")),
    ("shin", ("shin", "lower leg", "lower_leg", "calf", "knee")),
    ("thigh", ("thigh", "upper leg", "upper_leg", "leg")),
    ("head", ("head",)),
    ("torso", ("chest", "torso", "spine", "trunk", "body")),
]
_LEFT = re.compile(r"(^|[^a-z])(left|l)([^a-z]|$)")
_RIGHT = re.compile(r"(^|[^a-z])(right|r)([^a-z]|$)")


class NotRetargetable(ValueError):
    """A clip that cannot become a reference yet, with a sentence a person can read."""


def _kind(text: str) -> str | None:
    return next((kind for kind, words in _KINDS if any(word in text for word in words)), None)


def match_parts(project: Project, body: BodySpec, compiled: CompiledModel | None = None) -> dict[SegmentName, str]:
    """Which part of the body each segment maps onto, by the part's name and side; the side comes from where the
    part sits (+y is the body's left) when its name does not say."""
    compiled = compiled or compile_project(project)
    model = compiled.model
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    root = next((obj for obj in body.objects if obj.parent is None), None)
    matched: dict[SegmentName, str] = {}
    for obj in body.objects:
        text = f"{obj.name} {obj.id}".lower().replace("-", " ")
        kind = _kind(text)
        geom = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, obj.id)
        if kind is None or geom < 0:
            continue
        if kind in ("torso", "head"):
            segment: str = kind
        else:
            side = "left" if _LEFT.search(text) else "right" if _RIGHT.search(text) else None
            if side is None:
                side = "left" if float(data.geom_xpos[geom, 1]) > float(data.xpos[0, 1]) else "right"
            segment = f"{side}_{kind}"
        if segment in SEGMENT_POINTS and segment not in matched:
            matched[segment] = obj.id  # type: ignore[index]
    if "torso" not in matched and root is not None:
        matched["torso"] = root.id
    return matched


def _points(frame: TrackedFrame) -> dict[str, Keypoint]:
    points = {point.name: point for point in frame.keypoints}
    if "left_hip" in points and "right_hip" in points:
        left, right = points["left_hip"], points["right_hip"]
        points["hips"] = Keypoint(name="left_hip", x=(left.x + right.x) / 2, y=(left.y + right.y) / 2)
    return points


def facing(clip: MotionClip) -> float:
    """1 when the person faces the picture's right, -1 its left: in a side view knees bend toward where they face."""
    if clip.view == "front":
        return 1.0
    votes = 0.0
    for frame in clip.frames:
        points = _points(frame)
        for side in ("left", "right"):
            hip, knee, ankle = (points.get(f"{side}_{name}") for name in ("hip", "knee", "ankle"))
            if hip and knee and ankle:
                votes += knee.x - (hip.x + ankle.x) / 2
    return -1.0 if votes < 0 else 1.0


def segment_angle(frame: TrackedFrame, segment: SegmentName, clip: MotionClip, mirror: float) -> float | None:
    """The segment's direction in the picture, with forward to the right and up at π/2."""
    points = _points(frame)
    start, end = (points.get(name) for name in SEGMENT_POINTS[segment])
    if start is None or end is None:
        return None
    across = (end.x - start.x) * clip.video.width * mirror
    up = -(end.y - start.y) * clip.video.height
    if math.hypot(across, up) < 1e-9:
        return None
    return round(math.atan2(up, across), 4)


def build_reference(project: Project, clip: MotionClip, focus: tuple[float, float] | None = None) -> MotionReference:
    """The reference the body imitates: each matched segment's angle in every tracked frame."""
    if not clip.frames:
        raise NotRetargetable("Track the motion first: the clip has no pose yet")
    body = next(
        (item for item in project.bodies if item.id == clip.target), project.bodies[0] if project.bodies else None
    )
    if body is None:
        raise NotRetargetable("The project has no body to copy the motion onto")
    parts = match_parts(project, body)
    mirror = facing(clip)
    tracks: list[SegmentTrack] = []
    for segment in SEGMENTS:
        if segment not in parts:
            continue
        angles = [segment_angle(frame, segment, clip, mirror) for frame in clip.frames]
        if sum(angle is not None for angle in angles) >= max(2, len(angles) // 4):
            tracks.append(SegmentTrack(segment=segment, part=parts[segment], angles=angles))
    if not tracks:
        raise NotRetargetable("No limb of the person matched a part of the body, or the video rarely showed them")
    return MotionReference(
        clip=clip.id, name=clip.video.name, fps=clip.video.fps, view=clip.view, tracks=tracks, focus=focus
    )


def _wrapped(angle: float) -> float:
    return math.atan2(math.sin(angle), math.cos(angle))


def reference_pose(project: Project, compiled: CompiledModel, frame: int | None = None) -> dict[str, float]:
    """Hinge angles that turn each tracked part to the reference's direction at a frame (the middle by default):
    the change of each limb's angle from its tracked parent's, against the same at rest."""
    reference = project.task.motion
    if reference is None or not project.bodies:
        return {}
    model = compiled.model
    tracker = MotionTracker(reference, model)
    if not tracker.frames:
        return {}
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    rest = tracker.actual(data)
    wanted = tracker.angles[tracker.frames // 2 if frame is None else min(max(frame, 0), tracker.frames - 1)]
    parents = {obj.id: obj.parent for obj in project.bodies[0].objects}
    index = {part.part: number for number, part in enumerate(tracker.parts)}
    perpendicular = np.array([0.0, 1.0, 0.0]) if reference.view == "side" else np.array([1.0, 0.0, 0.0])
    sense = -1.0 if reference.view == "side" else 1.0
    angles: dict[str, float] = {}
    for part_id, number in index.items():
        joint = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_JOINT, f"{part_id}:joint")
        if joint < 0 or int(model.jnt_type[joint]) != int(mujoco.mjtJoint.mjJNT_HINGE):
            continue
        axis = data.xmat[int(model.jnt_bodyid[joint])].reshape(3, 3) @ model.jnt_axis[joint]
        along = float(axis @ perpendicular)
        if abs(along) < 0.7 or wanted[number] is None or rest[number] is None:
            continue
        parent = parents.get(part_id)
        while parent is not None and parent not in index:
            parent = parents.get(parent)
        own = _wrapped(wanted[number] - rest[number])  # type: ignore[operator]
        if parent is not None:
            above = index[parent]
            if wanted[above] is not None and rest[above] is not None:
                own = _wrapped(own - (wanted[above] - rest[above]))  # type: ignore[operator]
        angles[part_id] = sense * own / math.copysign(1.0, along)
    return angles
