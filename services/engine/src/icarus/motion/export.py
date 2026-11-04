"""A motion as a file: JSON with every limb's angle per frame, or a BVH or glTF skeleton that turns in the picture's
plane. Only what was tracked or simulated goes in; a limb nobody saw keeps its last known angle."""

import base64
import json
import math
from pathlib import PurePath

from icarus.contracts.motion import MotionExportFile, MotionExportRequest, MotionView, SegmentName
from icarus.motion.gltf_export import gltf_motion
from icarus.motion.skeleton import ENDS, SKELETON, skeleton_frames


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
    for joint, parent, *_ in SKELETON:
        children.setdefault(parent, []).append(joint)
    offsets = {joint: offset for joint, _, _, offset, _ in SKELETON}

    def write(joint: str, depth: int) -> None:
        pad = "  " * depth
        offset = offsets[joint]
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
        if joint in ENDS:
            end = ENDS[joint]
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
    poses = skeleton_frames(segments, rows, roots, request.root_motion, request.loop)
    lines += ["MOTION", f"Frames: {len(poses)}", f"Frame Time: {1 / fps:.6f}"]
    for pose in poses:
        values = list(pose.root)
        for turn in pose.turns:
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
    if request.format == "gltf":
        poses = skeleton_frames(segments, rows, roots or [], request.root_motion, request.loop)
        content = base64.b64encode(gltf_motion(poses, fps, PurePath(name).stem)).decode("ascii")
        return MotionExportFile(
            name=f"{stem}.glb", media_type="model/gltf-binary", content=content, encoding="base64", frames=len(rows)
        )
    if request.format == "bvh":
        content = _bvh(segments, rows, fps, roots or [], request)
        return MotionExportFile(name=f"{stem}.bvh", media_type="text/plain", content=content, frames=len(rows))
    content = _json(name, request, segments, rows, fps, view, roots or [], match or [])
    return MotionExportFile(name=f"{stem}.json", media_type="application/json", content=content, frames=len(rows))
