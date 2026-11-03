"""The body as a URDF robot description, read from the compiled MuJoCo model so both describe the same robot.

URDF rotates a joint about its link's origin, so each link's frame sits on its joint's anchor and its shapes and
mass are moved back by the anchor. URDF has no capsule, wedge or ball joint: those become the nearest shape or a
fixed joint, and `notes` says so.
"""

import copy
import math
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

import mujoco
import numpy as np

from icarus.contracts.project import Project
from icarus.design.compiler import CompiledModel

_HINGE = int(mujoco.mjtJoint.mjJNT_HINGE)
_SLIDE = int(mujoco.mjtJoint.mjJNT_SLIDE)
_BALL = int(mujoco.mjtJoint.mjJNT_BALL)


@dataclass
class UrdfRobot:
    xml: str
    links: list[str]
    joints: dict[str, str]
    notes: list[str] = field(default_factory=list)


def _fmt(values) -> str:
    return " ".join(f"{float(value):.6g}" for value in values)


def _rpy(quat: np.ndarray) -> tuple[float, float, float]:
    """Fixed-axis roll, pitch and yaw (URDF) of a wxyz quaternion."""
    matrix = np.zeros(9)
    mujoco.mju_quat2Mat(matrix, np.asarray(quat, dtype=float))
    r = matrix.reshape(3, 3)
    pitch = math.asin(max(-1.0, min(1.0, -r[2, 0])))
    if abs(r[2, 0]) < 1 - 1e-9:
        return math.atan2(r[2, 1], r[2, 2]), pitch, math.atan2(r[1, 0], r[0, 0])
    return 0.0, pitch, math.atan2(-r[0, 1], r[1, 1])


def _origin(parent: ET.Element, xyz, quat) -> None:
    ET.SubElement(parent, "origin", {"xyz": _fmt(xyz), "rpy": _fmt(_rpy(quat))})


def _geometry(model: mujoco.MjModel, geom: int, notes: list[str], name: str) -> ET.Element | None:
    kind, size = int(model.geom_type[geom]), model.geom_size[geom]
    element = ET.Element("geometry")
    if kind == int(mujoco.mjtGeom.mjGEOM_BOX):
        ET.SubElement(element, "box", {"size": _fmt(2 * size)})
    elif kind == int(mujoco.mjtGeom.mjGEOM_SPHERE):
        ET.SubElement(element, "sphere", {"radius": _fmt([size[0]])})
    elif kind == int(mujoco.mjtGeom.mjGEOM_CYLINDER):
        ET.SubElement(element, "cylinder", {"radius": _fmt([size[0]]), "length": _fmt([2 * size[1]])})
    elif kind == int(mujoco.mjtGeom.mjGEOM_CAPSULE):
        ET.SubElement(element, "cylinder", {"radius": _fmt([size[0]]), "length": _fmt([2 * (size[1] + size[0])])})
        notes.append(f"{name} is a capsule, written as a cylinder of the same length")
    elif kind == int(mujoco.mjtGeom.mjGEOM_MESH):
        ET.SubElement(element, "box", {"size": _fmt(2 * model.geom_aabb[geom, 3:])})
        notes.append(f"{name} is a wedge, written as the box around it")
    else:
        return None
    return element


def _link(robot: ET.Element, model: mujoco.MjModel, body: int, anchor: np.ndarray, name: str, notes: list[str]) -> None:
    link = ET.SubElement(robot, "link", {"name": model.body(body).name})
    inertial = ET.SubElement(link, "inertial")
    _origin(inertial, model.body_ipos[body] - anchor, model.body_iquat[body])
    ET.SubElement(inertial, "mass", {"value": _fmt([model.body_mass[body]])})
    ixx, iyy, izz = (float(value) for value in model.body_inertia[body])
    ET.SubElement(inertial, "inertia", {"ixx": _fmt([ixx]), "iyy": _fmt([iyy]), "izz": _fmt([izz])} | _ZERO)
    for geom in range(model.ngeom):
        if int(model.geom_bodyid[geom]) != body:
            continue
        shape = _geometry(model, geom, notes, name)
        if shape is None:
            continue
        for tag in ("visual", "collision"):
            element = ET.SubElement(link, tag)
            _origin(element, model.geom_pos[geom] - anchor, model.geom_quat[geom])
            element.append(copy.deepcopy(shape))
            if tag == "visual":
                material = ET.SubElement(element, "material", {"name": f"{model.geom(geom).name or name}_color"})
                ET.SubElement(material, "color", {"rgba": _fmt(model.geom_rgba[geom])})


_ZERO = {"ixy": "0", "ixz": "0", "iyz": "0"}


def _joint_kind(model: mujoco.MjModel, joint: int | None) -> str:
    if joint is None:
        return "fixed"
    kind = int(model.jnt_type[joint])
    if kind == _HINGE:
        return "revolute" if bool(model.jnt_limited[joint]) else "continuous"
    if kind == _SLIDE:
        return "prismatic"
    return "fixed"


def _effort(model: mujoco.MjModel, joint: int) -> float:
    for index in range(model.nu):
        if int(model.actuator_trnid[index, 0]) == joint and bool(model.actuator_forcelimited[index]):
            return abs(float(model.actuator_gear[index, 0])) * float(np.max(np.abs(model.actuator_forcerange[index])))
        if int(model.actuator_trnid[index, 0]) == joint:
            return abs(float(model.actuator_gear[index, 0]))
    return 0.0


def _robot_parts(project: Project) -> dict[str, str]:
    """The body's root part, the one the brain drives, and every part attached under it, by id."""
    objects = project.bodies[0].objects
    root = next((obj.id for obj in objects if obj.parent is None), None)
    parts: dict[str, str] = {}
    for obj in objects:
        chain, parent = [obj.id], obj.parent
        while parent is not None:
            chain.append(parent)
            parent = next((item.parent for item in objects if item.id == parent), None)
        if chain[-1] == root:
            parts[obj.id] = obj.name
    return parts


def body_urdf(project: Project, compiled: CompiledModel, speeds: dict[str, float] | None = None) -> UrdfRobot:
    """The project's first body as URDF; `speeds` are joint speed limits by joint name, when known."""
    if not project.bodies:
        raise ValueError("The project has no body to describe")
    model = compiled.model
    objects = _robot_parts(project)
    bodies = [index for index in range(model.nbody) if model.body(index).name in objects]
    robot = ET.Element("robot", {"name": project.bodies[0].name})
    robot.append(ET.Comment(" Written by Icarus Studio 3D from the compiled MuJoCo model; SI units, Z up. "))
    notes = [
        f"{obj.name} is not attached to the robot, so it is left out"
        for obj in project.bodies[0].objects
        if obj.id not in objects
    ]
    joints: dict[str, str] = {}
    anchors: dict[int, np.ndarray] = {}
    for body in bodies:
        joint = next(
            (j for j in range(model.njnt) if int(model.jnt_bodyid[j]) == body and int(model.jnt_type[j]) != 0), None
        )
        anchors[body] = np.array(model.jnt_pos[joint]) if joint is not None else np.zeros(3)
        name = objects[model.body(body).name]
        _link(robot, model, body, anchors[body], name, notes)
        parent = int(model.body_parentid[body])
        if parent not in anchors:
            continue
        kind = _joint_kind(model, joint)
        if joint is not None and int(model.jnt_type[joint]) == _BALL:
            notes.append(f"{name} turns on a ball joint, which URDF cannot describe; it is written as fixed")
        joint_name = model.joint(joint).name if joint is not None else f"{model.body(body).name}:fixed"
        element = ET.SubElement(robot, "joint", {"name": joint_name, "type": kind})
        rotation = np.zeros(9)
        mujoco.mju_quat2Mat(rotation, model.body_quat[body])
        offset = model.body_pos[body] + rotation.reshape(3, 3) @ anchors[body] - anchors[parent]
        _origin(element, offset, model.body_quat[body])
        ET.SubElement(element, "parent", {"link": model.body(parent).name})
        ET.SubElement(element, "child", {"link": model.body(body).name})
        joints[joint_name] = kind
        if joint is None or kind == "fixed":
            continue
        ET.SubElement(element, "axis", {"xyz": _fmt(model.jnt_axis[joint])})
        ET.SubElement(element, "dynamics", {"damping": _fmt([model.dof_damping[int(model.jnt_dofadr[joint])]])})
        speed = (speeds or {}).get(joint_name)
        if speed is None:
            notes.append("A joint velocity of 0 means no speed was measured for it: train a brain to measure one")
        limit = {"effort": _fmt([_effort(model, joint)]), "velocity": _fmt([speed or 0.0])}
        if kind in ("revolute", "prismatic"):
            limit |= {"lower": _fmt([model.jnt_range[joint, 0]]), "upper": _fmt([model.jnt_range[joint, 1]])}
        ET.SubElement(element, "limit", limit)
    ET.indent(robot)
    links = [model.body(body).name for body in bodies]
    xml = '<?xml version="1.0"?>\n' + ET.tostring(robot, encoding="unicode") + "\n"
    return UrdfRobot(xml, links, joints, sorted(set(notes)))
