"""Test poses: a body's joints set in MuJoCo, then held by its own motors for a moment, to feel its joint limits and
see whether its motors can hold it. The project never changes; the result is the posed body as MuJoCo left it."""

import math
from dataclasses import dataclass

import mujoco
import numpy as np

from icarus.contracts.project import Project
from icarus.contracts.rig import PoseOption, PoseResult
from icarus.design.compiler import CompiledModel
from icarus.design.scene import scene_description

HOLD_SECONDS = 1.0
# Share of each joint's range a limit pose goes to.
_REACH = 0.6
# Parts of the body that sink into each other deeper than this overlap, in metres.
_OVERLAP = 0.01
_UPRIGHT = 0.5
_DROP = 0.6

POSES: dict[str, str] = {"rest": "Rest", "low": "Toward the lower limits", "high": "Toward the upper limits"}
CLIP_POSE = "clip"
CLIP_LABEL = "Frame from the clip"


class UnknownPose(LookupError):
    pass


@dataclass(frozen=True)
class _Joint:
    object: str
    index: int
    address: int
    low: float
    high: float
    limited: bool


def pose_options(has_clip: bool) -> list[PoseOption]:
    options = [PoseOption(id=pose, label=label) for pose, label in POSES.items()]
    return [*options, PoseOption(id=CLIP_POSE, label=CLIP_LABEL)] if has_clip else options


def _joints(model: mujoco.MjModel, objects: set[str]) -> list[_Joint]:
    joints: list[_Joint] = []
    for index in range(model.njnt):
        name = model.joint(index).name
        owner = name.removesuffix(":joint")
        kind = int(model.jnt_type[index])
        if owner not in objects or kind not in (int(mujoco.mjtJoint.mjJNT_HINGE), int(mujoco.mjtJoint.mjJNT_SLIDE)):
            continue
        low, high = (float(value) for value in model.jnt_range[index])
        joints.append(_Joint(owner, index, int(model.jnt_qposadr[index]), low, high, bool(model.jnt_limited[index])))
    return joints


def _target(joint: _Joint, pose: str, angles: dict[str, float]) -> float:
    if pose == CLIP_POSE:
        value = angles.get(joint.object, 0.0)
    elif pose == "low" and joint.limited:
        value = _REACH * joint.low
    elif pose == "high" and joint.limited:
        value = _REACH * joint.high
    else:
        value = 0.0
    return min(max(value, joint.low), joint.high) if joint.limited else value


def _body_geoms(model: mujoco.MjModel, objects: set[str]) -> set[int]:
    return {index for index in range(model.ngeom) if model.geom(index).name in objects}


def _lift_out_of_ground(model: mujoco.MjModel, data: mujoco.MjData, geoms: set[int], root_address: int | None):
    """Raise a free body by how deep its posed parts sink into anything else, so the pose starts standing."""
    if root_address is None:
        return
    mujoco.mj_forward(model, data)
    depths = [
        -float(contact.dist)
        for contact in data.contact[: data.ncon]
        if (int(contact.geom1) in geoms) != (int(contact.geom2) in geoms) and contact.dist < 0
    ]
    if depths:
        data.qpos[root_address + 2] += max(depths)
        mujoco.mj_forward(model, data)


def _overlaps(model: mujoco.MjModel, data: mujoco.MjData, geoms: set[int], names: dict[str, str]) -> list[str]:
    found: list[str] = []
    for contact in data.contact[: data.ncon]:
        first, second = int(contact.geom1), int(contact.geom2)
        if first in geoms and second in geoms and contact.dist < -_OVERLAP:
            a, b = (names.get(model.geom(index).name, model.geom(index).name) for index in (first, second))
            found.append(f"{a} sinks {abs(contact.dist) * 100:.0f} cm into {b}")
    return sorted(set(found))


def _servos(model: mujoco.MjModel) -> dict[int, int]:
    """Position servos by the joint they drive."""
    return {
        int(model.actuator_trnid[index, 0]): index
        for index in range(model.nu)
        if int(model.actuator_biastype[index]) == int(mujoco.mjtBias.mjBIAS_AFFINE)
    }


def take_pose(
    project: Project,
    compiled: CompiledModel,
    revision: int,
    pose: str,
    angles: dict[str, float] | None = None,
    body_id: str | None = None,
) -> PoseResult:
    """Set the body's joints for the pose, lift it onto the ground, then let its motors hold it for a second."""
    if pose not in POSES and pose != CLIP_POSE:
        raise UnknownPose(pose)
    body = next((item for item in project.bodies if body_id in (None, item.id)), None)
    if body is None:
        raise UnknownPose("The project has no body to pose")
    model = compiled.model
    objects = {obj.id for obj in body.objects}
    names = {obj.id: obj.name for obj in body.objects}
    joints = _joints(model, objects)
    targets = {joint.index: _target(joint, pose, angles or {}) for joint in joints}
    data = mujoco.MjData(model)
    for joint in joints:
        data.qpos[joint.address] = targets[joint.index]
    geoms = _body_geoms(model, objects)
    root = next((obj.id for obj in body.objects if obj.parent is None), None)
    root_body = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, root) if root else -1
    free = next(
        (
            int(model.jnt_qposadr[index])
            for index in range(model.njnt)
            if int(model.jnt_bodyid[index]) == root_body
            and int(model.jnt_type[index]) == int(mujoco.mjtJoint.mjJNT_FREE)
        ),
        None,
    )
    _lift_out_of_ground(model, data, geoms, free)
    overlaps = _overlaps(model, data, geoms, names)
    start_height = float(data.xpos[root_body, 2]) if root_body >= 0 else 0.0
    servos = _servos(model)
    for joint, actuator in servos.items():
        if joint in targets:
            low, high = model.actuator_ctrlrange[actuator]
            data.ctrl[actuator] = min(max(targets[joint], low), high)
    stable = True
    for _ in range(int(HOLD_SECONDS / model.opt.timestep)):
        mujoco.mj_step(model, data)
        if not (np.all(np.isfinite(data.qpos)) and np.all(np.isfinite(data.qvel))):
            stable = False
            break
    if not stable:
        mujoco.mj_resetData(model, data)
        mujoco.mj_forward(model, data)
    held = [joint for joint in joints if joint.index in servos]
    sag = [abs(float(data.qpos[joint.address]) - targets[joint.index]) for joint in held]
    upright = root_body < 0 or float(data.xmat[root_body].reshape(3, 3)[2, 2]) > _UPRIGHT
    standing = root_body < 0 or start_height <= 0 or float(data.xpos[root_body, 2]) > _DROP * start_height
    sag_degrees = math.degrees(sum(sag) / len(sag)) if sag else 0.0
    return PoseResult(
        pose=pose,
        label=POSES.get(pose, CLIP_LABEL),
        joints=len(joints),
        overlaps=overlaps,
        holds=stable and upright and standing,
        seconds=HOLD_SECONDS,
        sag_degrees=round(sag_degrees, 1),
        scene=scene_description(compiled, revision, live=data),
    )
