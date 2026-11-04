"""A robot MuJoCo compiled from URDF or MJCF, mapped onto the library's body components: each body becomes a part
placed where its first collider sits, its other colliders welded parts, its joints and motors the library's."""

import math
import re
from dataclasses import dataclass

import mujoco
import numpy as np

from icarus.library.parts import Part, Raw

_GEOM = mujoco.mjtGeom
_SHAPES = {
    int(_GEOM.mjGEOM_BOX): "box",
    int(_GEOM.mjGEOM_SPHERE): "sphere",
    int(_GEOM.mjGEOM_CAPSULE): "capsule",
    int(_GEOM.mjGEOM_CYLINDER): "cylinder",
    int(_GEOM.mjGEOM_ELLIPSOID): "box",
    int(_GEOM.mjGEOM_MESH): "box",
}
_JOINT_KINDS = {
    int(mujoco.mjtJoint.mjJNT_HINGE): "hinge",
    int(mujoco.mjtJoint.mjJNT_SLIDE): "slide",
    int(mujoco.mjtJoint.mjJNT_BALL): "ball",
}
_SIZE = (0.001, 100.0)
_MASS = (0.001, 10_000.0)
_FORCE = (0.1, 10_000.0)
_DAMPING = (0.0, 100.0)
_ANCHOR = 10.0
_DEGREES = 180.0
# An unlimited slide gets this travel either way, in metres; the library's slides always have limits.
_SLIDE = 0.5
# Mass of the massless link a body's second and later joints hang on.
_LINK_MASS = 0.001
# Gap left under the lowest collider so the robot starts just above the ground.
_GAP = 0.005

Vector = tuple[float, float, float]


@dataclass(frozen=True)
class _Frame:
    pos: np.ndarray
    rot: np.ndarray

    def inside(self, other: "_Frame") -> "_Frame":
        """`other` seen from this frame."""
        return _Frame(self.rot.T @ (other.pos - self.pos), self.rot.T @ other.rot)


@dataclass(frozen=True)
class RobotParts:
    parts: list[Part]
    root: str
    joints: int
    motors: int
    notes: list[str]


def euler_xyz(rot: np.ndarray) -> Vector:
    """Degrees around fixed X, then Y, then Z (the Transform's rotation) of a rotation matrix."""
    pitch = math.asin(max(-1.0, min(1.0, -float(rot[2, 0]))))
    if abs(math.cos(pitch)) > 1e-6:
        roll = math.atan2(float(rot[2, 1]), float(rot[2, 2]))
        yaw = math.atan2(float(rot[1, 0]), float(rot[0, 0]))
    else:
        sign = 1.0 if pitch > 0 else -1.0
        roll, yaw = math.atan2(sign * float(rot[0, 1]), float(rot[1, 1])), 0.0
    return (_round(math.degrees(roll)), _round(math.degrees(pitch)), _round(math.degrees(yaw)))


def _round(value: float) -> float:
    return round(float(value), 6) + 0.0


def _vector(values: np.ndarray, limit: float) -> Vector:
    x, y, z = (_round(max(-limit, min(limit, float(value)))) for value in values)
    return (x, y, z)


def _clamp(value: float, bounds: tuple[float, float]) -> float:
    return _round(max(bounds[0], min(bounds[1], value)))


def _hex(rgba: np.ndarray) -> str:
    red, green, blue = (max(0, min(255, round(float(channel) * 255))) for channel in rgba[:3])
    return f"#{red:02x}{green:02x}{blue:02x}"


def _label(name: str, fallback: str) -> str:
    text = name.replace("_", " ").replace("-", " ").strip()
    return (text[:1].upper() + text[1:])[:80] if text else fallback


class _Mapping:
    def __init__(self, model: mujoco.MjModel, taken: set[str], floating: bool) -> None:
        self.model = model
        self.data = mujoco.MjData(model)
        mujoco.mj_forward(model, self.data)
        self.taken = set(taken)
        self.floating = floating
        self.parts: list[Part] = []
        self.objects: dict[int, str] = {}
        self.frames: dict[str, _Frame] = {}
        self.joint_objects: dict[int, str] = {}

    def free_id(self, name: str, fallback: str) -> str:
        base = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:48] or fallback
        candidate, number = base, 2
        while candidate in self.taken:
            candidate, number = f"{base}-{number}", number + 1
        self.taken.add(candidate)
        return candidate

    def colliders(self, body: int) -> list[int]:
        model = self.model
        return [
            geom
            for geom in range(model.ngeom)
            if model.geom_bodyid[geom] == body
            and int(model.geom_type[geom]) in _SHAPES
            and (model.geom_contype[geom] or model.geom_conaffinity[geom])
        ]

    def geom_frame(self, geom: int) -> _Frame:
        rot = self.data.geom_xmat[geom].reshape(3, 3).copy()
        pos = self.data.geom_xpos[geom].copy()
        if int(self.model.geom_type[geom]) == int(_GEOM.mjGEOM_MESH):
            pos = pos + rot @ self.model.geom_aabb[geom][:3]
        return _Frame(pos, rot)

    def shape(self, geom: int) -> tuple[str, Vector]:
        model = self.model
        kind = int(model.geom_type[geom])
        size = model.geom_size[geom]
        match kind:
            case _ if kind == int(_GEOM.mjGEOM_SPHERE):
                full = np.array([2 * size[0]] * 3)
            case _ if kind == int(_GEOM.mjGEOM_CAPSULE):
                full = np.array([2 * size[0], 2 * size[0], 2 * size[1] + 2 * size[0]])
            case _ if kind == int(_GEOM.mjGEOM_CYLINDER):
                full = np.array([2 * size[0], 2 * size[0], 2 * size[1]])
            case _ if kind == int(_GEOM.mjGEOM_MESH):
                full = 2 * model.geom_aabb[geom][3:]
            case _:
                full = 2 * size[:3]
        x, y, z = (_clamp(float(value), _SIZE) for value in full)
        return _SHAPES[kind], (x, y, z)

    def lowest(self, bodies: list[int]) -> float:
        lows = []
        for body in bodies:
            for geom in self.colliders(body):
                frame, (_, size) = self.geom_frame(geom), self.shape(geom)
                lows.append(float(frame.pos[2]) - float(np.abs(frame.rot[2]) @ (np.array(size) / 2)))
        return min(lows) if lows else float(self.data.xpos[bodies[0]][2])

    def transform(self, parent: str | None, frame: _Frame, shift: np.ndarray) -> dict[str, Raw]:
        local = self.frames[parent].inside(frame) if parent else _Frame(frame.pos + shift, frame.rot)
        return {"position": _vector(local.pos, 1000), "rotation": euler_xyz(local.rot)}

    def joint(self, joint: int, frame: _Frame) -> dict[str, Raw]:
        model = self.model
        kind = _JOINT_KINDS[int(model.jnt_type[joint])]
        anchor = frame.rot.T @ (self.data.xanchor[joint] - frame.pos)
        axis = frame.rot.T @ self.data.xaxis[joint]
        low, high = (float(value) for value in model.jnt_range[joint])
        limited = bool(model.jnt_limited[joint])
        match kind:
            case "hinge":
                limits = (math.degrees(low), math.degrees(high)) if limited else (-_DEGREES, _DEGREES)
            case "slide":
                limits = (low, high) if limited else (-_SLIDE, _SLIDE)
            case _:
                limits = (-math.degrees(high), math.degrees(high)) if limited else (-_DEGREES, _DEGREES)
        return {
            "kind": kind,
            "axis": _vector(axis / max(float(np.linalg.norm(axis)), 1e-9), 1),
            "limits": (_clamp(limits[0], (-_DEGREES, _DEGREES)), _clamp(limits[1], (-_DEGREES, _DEGREES))),
            "anchor": _vector(anchor, _ANCHOR),
            "damping": _clamp(float(model.dof_damping[model.jnt_dofadr[joint]]), _DAMPING),
        }

    def look(self, geom: int) -> dict[str, Raw]:
        material = int(self.model.geom_matid[geom])
        rgba = self.model.mat_rgba[material] if material >= 0 else self.model.geom_rgba[geom]
        return {"color": _hex(rgba)}

    def solid(self, geom: int, mass: float, frame_parent: str | None, frame: _Frame, shift: np.ndarray):
        shape, size = self.shape(geom)
        friction = _clamp(float(self.model.geom_friction[geom][0]), (0.0, 2.0))
        return {
            "transform": self.transform(frame_parent, frame, shift),
            "mesh": {"shape": shape, "size": size},
            "material": self.look(geom),
            "physics_body": {"mode": "dynamic", "mass": _clamp(mass, _MASS)},
            "collider": {"friction": friction},
        }

    def body_frame(self, body: int) -> _Frame:
        return _Frame(self.data.xpos[body].copy(), self.data.xmat[body].reshape(3, 3).copy())

    def body(self, body: int, root: int, shift: np.ndarray) -> None:
        model = self.model
        name = model.body(body).name
        label = _label(name, f"Part {body}")
        geoms = self.colliders(body)
        volumes = [float(np.prod(self.shape(geom)[1])) for geom in geoms]
        shares = [float(model.body_mass[body]) * volume / sum(volumes) for volume in volumes] if geoms else []
        frame = self.geom_frame(geoms[0]) if geoms else self.body_frame(body)
        first = model.body_jntadr[body]
        joints = [
            joint
            for joint in range(first, first + model.body_jntnum[body])
            if int(model.jnt_type[joint]) in _JOINT_KINDS
        ]
        parent = None if body == root else self.objects[int(model.body_parentid[body])]
        # MuJoCo stacks several joints in one body; the library has one per part, so each extra one gets a link.
        for number, joint in enumerate(joints[:-1], start=1):
            link = self.free_id(f"{name}-joint-{number}", f"part-{body}-joint-{number}")
            components = {
                "transform": self.transform(parent, frame, shift),
                "physics_body": {"mode": "dynamic", "mass": _LINK_MASS},
                "joint": self.joint(joint, frame),
            }
            self.add(Part(link, f"{label} joint {number}"[:80], parent, components), frame)
            self.joint_objects[joint] = link
            parent = link
        object_id = self.free_id(name, f"part-{body}")
        if geoms:
            components = self.solid(geoms[0], shares[0], parent, frame, shift)
        else:
            mass = _clamp(float(model.body_mass[body]), _MASS)
            components = {
                "transform": self.transform(parent, frame, shift),
                "physics_body": {"mode": "dynamic", "mass": mass},
            }
        if joints:
            components["joint"] = self.joint(joints[-1], frame)
            self.joint_objects[joints[-1]] = object_id
        if body == root:
            components["balance"] = {}
            if not self.floating:
                components["physics_body"] = {"mode": "static"}
        self.add(Part(object_id, label, parent, components), frame)
        self.objects[body] = object_id
        for number, (geom, share) in enumerate(zip(geoms[1:], shares[1:], strict=True), start=2):
            extra = self.free_id(f"{name}-{number}", f"part-{body}-{number}")
            where = self.geom_frame(geom)
            components = self.solid(geom, share, object_id, where, shift)
            self.add(Part(extra, f"{label} {number}"[:80], object_id, components), where)

    def add(self, part: Part, frame: _Frame) -> None:
        self.parts.append(part)
        self.frames[part.id] = frame


def _motor(model: mujoco.MjModel, actuator: int, fallback: float) -> tuple[str, float]:
    """The library motor closest to a MuJoCo actuator: a position servo with its stiffness, else a torque motor."""
    affine = int(model.actuator_biastype[actuator]) == int(mujoco.mjtBias.mjBIAS_AFFINE)
    if affine and model.actuator_biasprm[actuator][1] < 0:
        return "position", float(-model.actuator_biasprm[actuator][1])
    if model.actuator_ctrllimited[actuator]:
        reach = float(np.abs(model.actuator_ctrlrange[actuator]).max())
        return "torque", abs(float(model.actuator_gear[actuator][0])) * reach
    if model.actuator_forcelimited[actuator]:
        return "torque", float(np.abs(model.actuator_forcerange[actuator]).max())
    return "torque", fallback


def _motors(
    model: mujoco.MjModel, joints: list[int], fallback: float, notes: list[str]
) -> dict[int, tuple[str, float]]:
    """The file's motors on joints the import keeps; a file without any gets a servo on every hinge and slide."""
    driven: dict[int, tuple[str, float]] = {}
    drivable = [joint for joint in joints if _JOINT_KINDS[int(model.jnt_type[joint])] != "ball"]
    for actuator in range(model.nu):
        joint = int(model.actuator_trnid[actuator][0])
        if int(model.actuator_trntype[actuator]) != int(mujoco.mjtTrn.mjTRN_JOINT) or joint not in drivable:
            name = model.actuator(actuator).name or str(actuator)
            notes.append(f"Motor {name} drives no hinge or slide the import keeps; left out")
            continue
        driven[joint] = _motor(model, actuator, fallback)
    if model.nu == 0 and drivable:
        for joint in drivable:
            limited = model.jnt_actfrclimited[joint]
            driven[joint] = ("position", float(np.abs(model.jnt_actfrcrange[joint]).max()) if limited else fallback)
        notes.append(f"The file has no motors, so each of its {len(drivable)} hinge and slide joints got one")
    return driven


def _notes(model: mujoco.MjModel, roots: list[int], bodies: list[int], mapping: _Mapping) -> list[str]:
    notes: list[str] = []
    if len(roots) > 1:
        notes.append(f"Kept the largest body tree; {len(roots) - 1} other loose bodies of the file were left out")
    if any(model.geom_bodyid[geom] == 0 for geom in range(model.ngeom)):
        notes.append("The file's floor and fixed scenery were left out; the project's world stays")
    colliders = {geom for body in bodies for geom in mapping.colliders(body)}
    meshes = sum(1 for geom in colliders if int(model.geom_type[geom]) == int(_GEOM.mjGEOM_MESH))
    if meshes:
        notes.append(f"{meshes} mesh colliders became boxes the size of each mesh")
    hidden = sum(1 for geom in range(model.ngeom) if model.geom_bodyid[geom] in bodies and geom not in colliders)
    if hidden:
        notes.append(f"{hidden} drawing-only or unsupported shapes were left out; the colliders stay")
    return notes


def robot_parts(model: mujoco.MjModel, *, taken: set[str], at: Vector, floating: bool | None = None) -> RobotParts:
    """The parts of the robot's largest body tree, its lowest collider just above `at`. `floating` None keeps the
    file's base: free when the tree's root has a free joint, else fixed to the world."""
    roots = [body for body in range(1, model.nbody) if model.body_parentid[body] == 0]
    sizes = {root: sum(1 for body in range(1, model.nbody) if model.body_rootid[body] == root) for root in roots}
    root = max(roots, key=lambda item: sizes[item])
    bodies = [body for body in range(1, model.nbody) if model.body_rootid[body] == root]
    first = model.body_jntadr[root]
    free_joint = int(mujoco.mjtJoint.mjJNT_FREE)
    free = any(int(model.jnt_type[joint]) == free_joint for joint in range(first, first + model.body_jntnum[root]))
    mapping = _Mapping(model, taken, free if floating is None else floating)
    origin = mapping.data.xpos[root]
    shift = np.array([at[0] - origin[0], at[1] - origin[1], at[2] - mapping.lowest(bodies) + _GAP])
    for body in bodies:
        mapping.body(body, root, shift)
    notes = _notes(model, roots, bodies, mapping)
    joints = list(mapping.joint_objects)
    # Without a force in the file, a motor can hold the robot's weight half a metre out.
    fallback = _clamp(float(sum(model.body_mass[body] for body in bodies)) * 9.81 * 0.5, _FORCE)
    driven = _motors(model, joints, fallback, notes)
    by_id = {part.id: part for part in mapping.parts}
    for joint, (kind, force) in driven.items():
        by_id[mapping.joint_objects[joint]].components["motor"] = {"kind": kind, "max_force": _clamp(force, _FORCE)}
    return RobotParts(mapping.parts, mapping.objects[root], len(joints), len(driven), notes)
