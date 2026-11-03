"""The rig audit: problems in a body that pass the design tests yet keep it from learning well, each with the edit
operations that fix it. Joints left without a motor, motors too weak to lift their limb, a legged body that cannot
feel its tilt and feet that cannot feel the ground."""

from dataclasses import dataclass

import mujoco
import numpy as np

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.operations import AddComponent, EditOperation, SetProperty
from icarus.contracts.project import Project
from icarus.contracts.properties import NumberValue
from icarus.contracts.specs import BodySpec
from icarus.design.compiler import CompiledModel
from icarus.design.components import view
from icarus.library.components import default_component

GRAVITY = 9.81
# A motor must hold its limb straight out with this much to spare, and a fix leaves it this much stronger.
_SPARE = 1.0
_FIXED_SPARE = 1.5
# A body with this many motors walks or crawls, so it needs to feel its tilt.
_MOTORS_FOR_BALANCE = 4
# A part whose lowest point is this close to the floor at rest is a foot.
_FOOT_HEIGHT = 0.05
_MIN_FORCE = 2.0


@dataclass(frozen=True)
class Finding:
    id: str
    part: str
    text: str
    fix: list[EditOperation]


def _motors(body: BodySpec) -> dict[str, ObjectSpec]:
    """The object holding the motor that drives each joint object."""
    driven: dict[str, ObjectSpec] = {}
    for obj in body.objects:
        motor = view(obj, "motor")
        if motor is not None:
            driven[motor.text("joint") or obj.id] = obj
    return driven


def _holding_torque(compiled: CompiledModel, data: mujoco.MjData, obj: ObjectSpec) -> float | None:
    """What the joint must give to hold everything past it straight out against gravity, in N·m."""
    model = compiled.model
    joint = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_JOINT, f"{obj.id}:joint")
    if joint < 0:
        return None
    body = int(model.jnt_bodyid[joint])
    lever = float(np.linalg.norm(data.subtree_com[body] - data.xanchor[joint]))
    return float(model.body_subtreemass[body]) * GRAVITY * lever


def _motor_component(force: float):
    component = default_component("motor", "motor")
    component.properties["max_force"] = NumberValue(type="number", value=round(force, 1))
    return component


def _joint_findings(body: BodySpec, compiled: CompiledModel, data: mujoco.MjData) -> list[Finding]:
    driven = _motors(body)
    findings: list[Finding] = []
    for obj in body.objects:
        joint = view(obj, "joint")
        if joint is None or joint.text("kind") in ("fixed", "ball"):
            continue
        low, high = joint.span("limits")
        if joint.text("kind") == "hinge" and low <= -180 and high >= 180:
            continue
        needed = _holding_torque(compiled, data, obj)
        if needed is None:
            continue
        motor_obj = driven.get(obj.id)
        if motor_obj is None:
            if not driven:
                continue
            force = max(needed * _FIXED_SPARE, _MIN_FORCE)
            fix: list[EditOperation] = [
                AddComponent(op="add_component", object=obj.id, component=_motor_component(force))
            ]
            text = f"{obj.name}: its joint has no motor, so the brain cannot move it"
            findings.append(Finding(f"motor:{obj.id}", obj.id, text, fix))
            continue
        motor = view(motor_obj, "motor")
        assert motor is not None
        strength = motor.number("max_force") * motor.number("gear")
        if strength < needed * _SPARE:
            force = max(needed * _FIXED_SPARE / max(motor.number("gear"), 1e-6), _MIN_FORCE)
            component = next(item for item in motor_obj.components if item.kind == "motor")
            value = NumberValue(type="number", value=round(force, 1))
            fix = [
                SetProperty(
                    op="set_property", object=motor_obj.id, component=component.id, property="max_force", value=value
                )
            ]
            text = f"{obj.name}: motor too weak to lift it ({strength:.0f} N·m, it needs {needed:.0f})"
            findings.append(Finding(f"weak:{obj.id}", obj.id, text, fix))
    return findings


def _sense_findings(body: BodySpec, compiled: CompiledModel, data: mujoco.MjData) -> list[Finding]:
    root = next((obj for obj in body.objects if obj.parent is None), None)
    if root is None or len(_motors(body)) < _MOTORS_FOR_BALANCE:
        return []
    findings: list[Finding] = []
    if not any(view(obj, "balance") for obj in body.objects):
        fix: list[EditOperation] = [
            AddComponent(op="add_component", object=root.id, component=default_component("balance", "balance"))
        ]
        text = f"{root.name}: a body on legs cannot feel which way it tilts without a balance sense"
        findings.append(Finding(f"balance:{root.id}", root.id, text, fix))
    model = compiled.model
    parents = {obj.parent for obj in body.objects}
    lowest = min((float(data.geom_xpos[i, 2] - _half_height(model, data, i)) for i in _geoms(model, body)), default=0)
    for obj in body.objects:
        geom = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, obj.id)
        if obj.id in parents or obj.parent is None or geom < 0 or view(obj, "touch") is not None:
            continue
        bottom = float(data.geom_xpos[geom, 2] - _half_height(model, data, geom))
        if bottom - lowest > _FOOT_HEIGHT:
            continue
        touch = default_component("touch", "touch")
        touch.properties["radius"] = NumberValue(
            type="number", value=round(max(float(model.geom_rbound[geom]), 0.01), 3)
        )
        fix = [AddComponent(op="add_component", object=obj.id, component=touch)]
        findings.append(Finding(f"touch:{obj.id}", obj.id, f"{obj.name}: a foot that cannot feel the ground", fix))
    return findings


def _geoms(model: mujoco.MjModel, body: BodySpec) -> list[int]:
    found = (mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, obj.id) for obj in body.objects)
    return [geom for geom in found if geom >= 0]


def _half_height(model: mujoco.MjModel, data: mujoco.MjData, geom: int) -> float:
    """How far the geom reaches below its center, from its bounding box turned into the world."""
    rotation = data.geom_xmat[geom].reshape(3, 3)
    half = model.geom_aabb[geom, 3:]
    return float(np.abs(rotation[2]) @ half)


def rig_findings(project: Project, compiled: CompiledModel) -> list[Finding]:
    """Every problem the audit finds in the project's bodies, at the designed pose."""
    data = mujoco.MjData(compiled.model)
    mujoco.mj_forward(compiled.model, data)
    findings: list[Finding] = []
    for body in project.bodies:
        findings += _joint_findings(body, compiled, data) + _sense_findings(body, compiled, data)
    return findings
