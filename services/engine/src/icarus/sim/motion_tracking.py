"""How closely a body copies a tracked motion: each tracked limb's direction, seen from the video's side, against
the reference's at the same moment of the clip (ADR 014)."""

import math
from dataclasses import dataclass

import mujoco
import numpy as np

from icarus.contracts.motion import MotionReference, MotionView, SegmentName

# Angle error, in radians, at which a limb's match falls to 1/e.
SIGMA = 0.6
# A limb pointing almost straight at the camera says nothing about its direction in the picture.
_FLAT = 1e-6


@dataclass(frozen=True)
class TrackedPart:
    segment: SegmentName
    # The part's object id, which is also its geom's name.
    part: str
    geom: int
    # The limb's direction, from its joint toward its far end, in the geom's own frame.
    local: np.ndarray


def limb_direction(model: mujoco.MjModel, geom: int) -> np.ndarray:
    """From the joint the part hangs on toward the part's center; straight up the body for a part on no joint."""
    body = int(model.geom_bodyid[geom])
    rotation = np.zeros(9)
    mujoco.mju_quat2Mat(rotation, model.geom_quat[geom])
    to_geom = rotation.reshape(3, 3)
    joints = [int(model.body_jntadr[body]) + offset for offset in range(int(model.body_jntnum[body]))]
    hinge = next((j for j in joints if int(model.jnt_type[j]) != int(mujoco.mjtJoint.mjJNT_FREE)), None)
    if hinge is None:
        vector = to_geom.T @ np.array([0.0, 0.0, 1.0])
    else:
        vector = -(to_geom.T @ (model.jnt_pos[hinge] - model.geom_pos[geom]))
    norm = float(np.linalg.norm(vector))
    return vector / norm if norm > 1e-9 else to_geom.T @ np.array([0.0, 0.0, -1.0])


def view_angle(direction: np.ndarray, view: MotionView) -> float | None:
    """The direction's angle in the picture: forward (side view) or the body's left (front view) is 0, up is π/2."""
    across = float(direction[0] if view == "side" else direction[1])
    up = float(direction[2])
    if math.hypot(across, up) < _FLAT:
        return None
    return math.atan2(up, across)


def angle_match(reference: float | None, actual: float | None) -> float | None:
    if reference is None or actual is None:
        return None
    error = math.atan2(math.sin(actual - reference), math.cos(actual - reference))
    return math.exp(-((error / SIGMA) ** 2))


def mean_match(matches: list[float | None]) -> float:
    known = [value for value in matches if value is not None]
    return sum(known) / len(known) if known else 0.0


class MotionTracker:
    """A project's motion reference bound to its compiled model's geoms."""

    def __init__(self, reference: MotionReference, model: mujoco.MjModel) -> None:
        self.reference = reference
        self.parts: list[TrackedPart] = []
        columns: list[list[float | None]] = []
        for track in reference.tracks:
            geom = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, track.part)
            if geom < 0:
                continue
            self.parts.append(TrackedPart(track.segment, track.part, geom, limb_direction(model, geom)))
            columns.append(track.angles)
        self.frames = len(columns[0]) if columns else 0
        self.angles: list[list[float | None]] = [list(row) for row in zip(*columns, strict=True)] if columns else []
        self.duration = max(self.frames / reference.fps, 1.0)

    def frame_at(self, time: float) -> int:
        return min(max(int(time * self.reference.fps), 0), max(self.frames - 1, 0))

    def actual(self, data: mujoco.MjData) -> list[float | None]:
        """Each tracked limb's angle in the picture right now."""
        view = self.reference.view
        return [view_angle(data.geom_xmat[part.geom].reshape(3, 3) @ part.local, view) for part in self.parts]

    def match(self, data: mujoco.MjData, time: float) -> tuple[float, list[float | None]]:
        """The whole body's match at this moment of the clip, 0 to 1, and each limb's."""
        if not self.frames:
            return 0.0, []
        reference = self.angles[self.frame_at(time)]
        each = [angle_match(ref, act) for ref, act in zip(reference, self.actual(data), strict=True)]
        return mean_match(each), each

    def phase(self, time: float) -> float:
        return min(max(time / self.duration, 0.0), 1.0)
