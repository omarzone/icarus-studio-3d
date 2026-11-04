"""The skeleton the animation files share, turning in the picture's plane, and its pose at every frame of a motion.
Only what was tracked or simulated goes in; a limb nobody saw keeps its last known angle."""

import math
from dataclasses import dataclass

from icarus.contracts.motion import SegmentName

Vector = tuple[float, float, float]

# Joints in order: name, parent, the segment that turns it, offset from the parent in metres (side view: X forward,
# Y up, Z toward the viewer), and its angle in the picture at rest.
_UP, _DOWN = math.pi / 2, -math.pi / 2
SKELETON: list[tuple[str, str | None, SegmentName | None, Vector, float]] = [
    ("Hips", None, "torso", (0.0, 0.0, 0.0), _UP),
    ("Spine", "Hips", None, (0.0, 0.1, 0.0), _UP),
    ("Neck", "Spine", "head", (0.0, 0.42, 0.0), _UP),
    ("LeftArm", "Spine", "left_upper_arm", (0.0, 0.38, 0.18), _DOWN),
    ("LeftForeArm", "LeftArm", "left_forearm", (0.0, -0.3, 0.0), _DOWN),
    ("RightArm", "Spine", "right_upper_arm", (0.0, 0.38, -0.18), _DOWN),
    ("RightForeArm", "RightArm", "right_forearm", (0.0, -0.3, 0.0), _DOWN),
    ("LeftUpLeg", "Hips", "left_thigh", (0.0, 0.0, 0.1), _DOWN),
    ("LeftLeg", "LeftUpLeg", "left_shin", (0.0, -0.43, 0.0), _DOWN),
    ("RightUpLeg", "Hips", "right_thigh", (0.0, 0.0, -0.1), _DOWN),
    ("RightLeg", "RightUpLeg", "right_shin", (0.0, -0.43, 0.0), _DOWN),
]
# Where the last joint of each chain ends, from that joint.
ENDS: dict[str, Vector] = {"Neck": (0.0, 0.22, 0.0), "LeftForeArm": (0.0, -0.27, 0.0)}
ENDS |= {"RightForeArm": (0.0, -0.27, 0.0), "LeftLeg": (0.0, -0.43, 0.0), "RightLeg": (0.0, -0.43, 0.0)}


@dataclass(frozen=True)
class SkeletonFrame:
    # The root's position in the picture's plane (forward or left, up, 0) in metres.
    root: Vector
    # Each joint's turn from its rest pose about the axis toward the viewer, radians, in `SKELETON` order.
    turns: list[float]


def _filled(rows: list[list[float | None]], segments: list[SegmentName]) -> list[dict[SegmentName, float | None]]:
    """Each frame's angle per segment, carrying the last known angle over frames that did not show it."""
    last: dict[SegmentName, float | None] = dict.fromkeys(segments)
    frames: list[dict[SegmentName, float | None]] = []
    for row in rows:
        for segment, angle in zip(segments, row, strict=True):
            if angle is not None:
                last[segment] = angle
        frames.append(dict(last))
    return frames


def skeleton_frames(
    segments: list[SegmentName],
    rows: list[list[float | None]],
    roots: list[tuple[float, float]],
    root_motion: bool,
    loop: bool,
) -> list[SkeletonFrame]:
    """The skeleton's pose at every frame of `rows` (each frame's angle per segment); a loop repeats the first."""
    info: dict[str, tuple[SegmentName | None, float]] = {
        joint: (segment, rest) for joint, _, segment, _, rest in SKELETON
    }
    parents = {joint: parent for joint, parent, *_ in SKELETON}
    frames = _filled(rows, segments)
    if loop and frames:
        frames.append(frames[0])

    def absolute(joint: str | None, frame: dict[SegmentName, float | None]) -> float:
        while joint is not None:
            segment, rest = info[joint]
            if segment is not None:
                angle = frame.get(segment)
                return angle if angle is not None else rest
            joint = parents[joint]
        return _UP

    poses: list[SkeletonFrame] = []
    for index, frame in enumerate(frames):
        root = roots[min(index, len(roots) - 1)] if root_motion and roots else (0.0, 0.0)
        turns: list[float] = []
        for joint, parent, _, _, rest in SKELETON:
            parent_rest = info[parent][1] if parent else _UP
            turn = (
                (absolute(joint, frame) - absolute(parent, frame)) - (rest - parent_rest)
                if parent
                else (absolute(joint, frame) - rest)
            )
            turns.append(math.atan2(math.sin(turn), math.cos(turn)))
        poses.append(SkeletonFrame(root=(root[0], root[1], 0.0), turns=turns))
    return poses
