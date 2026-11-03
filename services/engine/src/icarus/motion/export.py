"""A motion as a file: JSON with every limb's angle per frame, or a BVH skeleton that turns in the picture's plane.
Only what was tracked or simulated goes in; a limb nobody saw keeps its last known angle."""

import json
import math
from pathlib import PurePath

from icarus.contracts.motion import MotionExportFile, MotionExportRequest, MotionView, SegmentName

# BVH joints in order: name, parent, the segment that turns it, offset from the parent in metres (side view: X
# forward, Y up, Z toward the viewer), and its angle in the picture at rest.
_UP, _DOWN = math.pi / 2, -math.pi / 2
_SKELETON: list[tuple[str, str | None, SegmentName | None, tuple[float, float, float], float]] = [
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
_ENDS = {"Neck": (0.0, 0.22, 0.0), "LeftForeArm": (0.0, -0.27, 0.0), "RightForeArm": (0.0, -0.27, 0.0)}
_ENDS |= {"LeftLeg": (0.0, -0.43, 0.0), "RightLeg": (0.0, -0.43, 0.0)}


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


def _json(name: str, request: MotionExportRequest, segments, rows, fps: float, view: MotionView, roots, match):
    frames = []
    for index, row in enumerate(rows):
        frame: dict[str, object] = {
            "time": round(index / fps, 4),
            "angles": {
                s: (None if a is None else round(math.degrees(a), 2)) for s, a in zip(segments, row, strict=True)
            },
        }
        if request.root_motion and roots:
            frame["root"] = roots[min(index, len(roots) - 1)]
        frames.append(frame)
    document = {
        "format": "icarus-motion",
        "version": 1,
        "name": name,
        "source": request.source,
        "view": view,
        "fps": fps,
        "loop": request.loop,
        "angle_units": "degrees in the picture's plane, 0 forward (side view) or the body's left (front view), 90 up",
        "segments": segments,
        "frames": frames,
    }
    if match:
        document["match"] = match
    return json.dumps(document, indent=1)


def _bvh(segments: list[SegmentName], rows, fps: float, roots, request: MotionExportRequest) -> str:
    lines = ["HIERARCHY"]
    children: dict[str | None, list[str]] = {}
    for joint, parent, *_ in _SKELETON:
        children.setdefault(parent, []).append(joint)
    info: dict[str, tuple[SegmentName | None, tuple[float, float, float], float]] = {
        joint: (segment, offset, rest) for joint, _, segment, offset, rest in _SKELETON
    }
    parents = {joint: parent for joint, parent, *_ in _SKELETON}

    def write(joint: str, depth: int) -> None:
        pad = "  " * depth
        _, offset, _ = info[joint]
        lines.append(f"{pad}{'ROOT' if depth == 0 else 'JOINT'} {joint}")
        lines.append(f"{pad}{{")
        lines.append(f"{pad}  OFFSET {offset[0]:.3f} {offset[1]:.3f} {offset[2]:.3f}")
        channels = (
            "Xposition Yposition Zposition Zrotation Xrotation Yrotation"
            if depth == 0
            else "Zrotation Xrotation Yrotation"
        )
        lines.append(f"{pad}  CHANNELS {6 if depth == 0 else 3} {channels}")
        for child in children.get(joint, []):
            write(child, depth + 1)
        if joint in _ENDS:
            end = _ENDS[joint]
            lines.extend(
                [
                    f"{pad}  End Site",
                    f"{pad}  {{",
                    f"{pad}    OFFSET {end[0]:.3f} {end[1]:.3f} {end[2]:.3f}",
                    f"{pad}  }}",
                ]
            )
        lines.append(f"{pad}}}")

    write("Hips", 0)
    frames = _filled(rows, segments)
    if request.loop and frames:
        frames.append(frames[0])
    lines += ["MOTION", f"Frames: {len(frames)}", f"Frame Time: {1 / fps:.6f}"]

    def absolute(joint: str | None, frame: dict[SegmentName, float | None]) -> float:
        while joint is not None:
            segment, _, rest = info[joint]
            if segment is not None:
                angle = frame.get(segment)
                return angle if angle is not None else rest
            joint = parents[joint]
        return _UP

    for index, frame in enumerate(frames):
        root = roots[min(index, len(roots) - 1)] if request.root_motion and roots else (0.0, 0.0)
        values = [root[0], root[1], 0.0]
        for joint, parent, _, _, rest in _SKELETON:
            parent_rest = info[parent][2] if parent else _UP
            turn = (
                (absolute(joint, frame) - absolute(parent, frame)) - (rest - parent_rest)
                if parent
                else (absolute(joint, frame) - rest)
            )
            turn = math.atan2(math.sin(turn), math.cos(turn))
            values += [math.degrees(turn), 0.0, 0.0]
        lines.append(" ".join(f"{value:.4f}" for value in values))
    return "\n".join(lines) + "\n"


def export_motion(
    name: str,
    request: MotionExportRequest,
    segments: list[SegmentName],
    rows: list[list[float | None]],
    fps: float,
    view: MotionView,
    roots: list[tuple[float, float]] | None = None,
    match: list[float] | None = None,
) -> MotionExportFile:
    """The motion in the asked format; `rows` holds each frame's angle per segment, `roots` the root's position in
    the picture's plane (forward or left, up) in metres."""
    stem = f"{PurePath(name).stem}-{request.source}"
    if request.format == "bvh":
        content = _bvh(segments, rows, fps, roots or [], request)
        return MotionExportFile(name=f"{stem}.bvh", media_type="text/plain", content=content, frames=len(rows))
    content = _json(name, request, segments, rows, fps, view, roots or [], match or [])
    return MotionExportFile(name=f"{stem}.json", media_type="application/json", content=content, frames=len(rows))
