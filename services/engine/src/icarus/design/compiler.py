import math
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass

import mujoco
import numpy as np

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.project import Project
from icarus.contracts.scene import SceneSky
from icarus.design.compile_error import CompileError
from icarus.design.components import ComponentView, view
from icarus.design.sensors import add_actuator, add_sensors
from icarus.design.sky import add_sky, world_sky
from icarus.design.surfaces import SURFACE_FRICTION
from icarus.projects.document import all_objects, containers

TIMESTEP = 0.002


@dataclass(frozen=True)
class CompiledModel:
    mjcf: str
    model: mujoco.MjModel
    # Object id → MJCF body name.
    objects: dict[str, str]
    # How the world looks around it; None when the world has no sky object.
    sky: SceneSky | None = None


def _fmt(values) -> str:
    return " ".join(f"{float(value):.6g}" for value in values)


def _quaternion(rotation_deg: tuple[float, float, float]) -> np.ndarray:
    quat = np.zeros(4)
    mujoco.mju_euler2Quat(quat, np.radians(rotation_deg), "XYZ")
    return quat


def _rgba(color: str) -> str:
    return _fmt([int(color[index : index + 2], 16) / 255 for index in (1, 3, 5)] + [1])


def _is_dynamic(obj: ObjectSpec) -> bool:
    physics = view(obj, "physics_body")
    return physics is not None and physics.text("mode") == "dynamic"


def _geom_size(obj: ObjectSpec, shape: str, size: tuple[float, float, float]) -> list[float]:
    if min(size) <= 0:
        raise CompileError(f"{obj.name} has a zero size")
    x, y, z = size
    match shape:
        case "box":
            return [x / 2, y / 2, z / 2]
        case "sphere":
            return [x / 2]
        case "capsule":
            radius = x / 2
            return [radius, max(z / 2 - radius, 1e-4)]
        case "cylinder":
            return [x / 2, z / 2]
        case _:
            return [x / 2, y / 2, 0.1]


def _friction(obj: ObjectSpec) -> float | None:
    for kind, prop in (("collider", "friction"), ("surface", "friction")):
        component = view(obj, kind)
        if component:
            return component.number(prop)
    material = view(obj, "material")
    return SURFACE_FRICTION[material.text("surface")] if material else None


def _add_geom(body: ET.Element, obj: ObjectSpec, scale: tuple[float, float, float]) -> None:
    mesh = view(obj, "mesh")
    if mesh is None:
        return
    shape = mesh.text("shape")
    size = mesh.vector("size")
    scaled = (size[0] * scale[0], size[1] * scale[1], size[2] * scale[2])
    attributes = {"name": obj.id, "type": shape, "size": _fmt(_geom_size(obj, shape, scaled))}
    physics = view(obj, "physics_body")
    attributes["mass"] = _fmt([physics.number("mass")]) if physics and _is_dynamic(obj) else "0"
    if shape == "plane" and _is_dynamic(obj):
        raise CompileError(f"{obj.name} is a plane, and planes can only be static")
    material = view(obj, "material")
    if material:
        attributes["rgba"] = _rgba(material.text("color"))
    friction = _friction(obj)
    if friction is not None:
        attributes["friction"] = _fmt([friction, 0.005, 0.0001])
    collider = view(obj, "collider")
    if collider:
        attributes["solref"] = _fmt([0.02, 1 - 0.9 * collider.number("restitution")])
    ET.SubElement(body, "geom", attributes)


def _add_joint(body: ET.Element, obj: ObjectSpec, joint: ComponentView) -> None:
    kind = joint.text("kind")
    link = joint.text("connects_to")
    if link and link != obj.parent:
        raise CompileError(f"{obj.name} connects to {link!r}, which is not its parent; move it inside {link!r} first")
    if kind == "fixed":
        return
    axis = np.array(joint.vector("axis"), dtype=float)
    if np.linalg.norm(axis) < 1e-9:
        raise CompileError(f"The joint on {obj.name} has no axis")
    low, high = joint.span("limits")
    attributes = {
        "name": f"{obj.id}:joint",
        "type": kind,
        "pos": _fmt(joint.vector("anchor")),
        "damping": _fmt([joint.number("damping")]),
    }
    if kind != "ball":
        attributes["axis"] = _fmt(axis / np.linalg.norm(axis))
    if kind == "hinge" and (low > -180 or high < 180):
        attributes["range"] = _fmt([math.radians(low), math.radians(high)])
    elif kind == "slide":
        attributes["range"] = _fmt([low, high])
    elif kind == "ball":
        attributes["range"] = _fmt([0, math.radians(max(abs(low), abs(high)))])
    ET.SubElement(body, "joint", attributes)


def _add_light(body: ET.Element, obj: ObjectSpec) -> None:
    light = view(obj, "light")
    if light is None:
        return
    color = light.text("color")
    strength = min(light.number("intensity"), 1.0)
    diffuse = [int(color[index : index + 2], 16) / 255 * strength for index in (1, 3, 5)]
    ET.SubElement(
        body,
        "light",
        {
            "name": obj.id,
            "directional": "true" if light.text("kind") == "sun" else "false",
            "dir": "0.3 0.2 -1",
            "diffuse": _fmt(diffuse),
        },
    )


def _add_markers(body: ET.Element, obj: ObjectSpec) -> None:
    for kind, size in (("spawn_point", None), ("goal_zone", "radius"), ("zone", "size")):
        marker = view(obj, kind)
        if marker is None:
            continue
        attributes = {"name": f"{obj.id}:{kind}", "group": "4", "rgba": "0 0 0 0"}
        if size == "size":
            attributes |= {"type": "box", "size": _fmt([value / 2 for value in marker.vector("size")])}
        else:
            attributes |= {"type": "sphere", "size": _fmt([marker.number(size) if size else 0.1])}
        ET.SubElement(body, "site", attributes)


def _add_body(parent: ET.Element, obj: ObjectSpec, children: dict[str | None, list[ObjectSpec]], root: ET.Element):
    transform = view(obj, "transform")
    position = transform.vector("position") if transform else (0.0, 0.0, 0.0)
    rotation = transform.vector("rotation") if transform else (0.0, 0.0, 0.0)
    scale = transform.vector("scale") if transform else (1.0, 1.0, 1.0)
    body = ET.SubElement(parent, "body", {"name": obj.id, "pos": _fmt(position), "quat": _fmt(_quaternion(rotation))})
    joint = view(obj, "joint")
    if joint:
        _add_joint(body, obj, joint)
    elif obj.parent is None and _is_dynamic(obj):
        ET.SubElement(body, "freejoint", {"name": f"{obj.id}:free"})
    _add_geom(body, obj, scale)
    if _is_dynamic(obj) and view(obj, "mesh") is None:
        physics = view(obj, "physics_body")
        mass = physics.number("mass") if physics else 1.0
        ET.SubElement(body, "inertial", {"pos": "0 0 0", "mass": _fmt([mass]), "diaginertia": "0.001 0.001 0.001"})
    _add_light(body, obj)
    _add_markers(body, obj)
    add_sensors(body, root, obj)
    for child in children.get(obj.id, []):
        _add_body(body, child, children, root)


def _readable(message: str, project: Project) -> str:
    names = {obj.id: obj.name for obj in all_objects(project)}
    first = message.strip().splitlines()[0] if message.strip() else "unknown error"
    for match in re.findall(r"name '([^']+)'", message):
        base = match.split(":")[0]
        if base in names:
            return f"{names[base]}: {first}"
    return f"The physics engine could not build this design: {first}"


def to_mjcf(project: Project) -> str:
    root = ET.Element("mujoco", {"model": project.id})
    ET.SubElement(root, "compiler", {"angle": "radian", "inertiafromgeom": "true", "autolimits": "true"})
    ET.SubElement(root, "option", {"timestep": str(TIMESTEP), "integrator": "implicitfast"})
    sky = world_sky(project)
    if sky:
        add_sky(root, sky)
    world = ET.SubElement(root, "worldbody")
    for objects in containers(project):
        children: dict[str | None, list[ObjectSpec]] = {}
        for obj in objects:
            children.setdefault(obj.parent, []).append(obj)
        for obj in children.get(None, []):
            _add_body(world, obj, children, root)
    for obj in all_objects(project):
        add_actuator(root, obj, project)
    return ET.tostring(root, encoding="unicode")


def compile_project(project: Project) -> CompiledModel:
    """Build the MuJoCo model of a structurally valid project."""
    mjcf = to_mjcf(project)
    try:
        model = mujoco.MjModel.from_xml_string(mjcf)
    except ValueError as error:
        raise CompileError(_readable(str(error), project)) from error
    objects = {obj.id: obj.id for obj in all_objects(project)}
    return CompiledModel(mjcf=mjcf, model=model, objects=objects, sky=world_sky(project))


__all__ = ["CompileError", "CompiledModel", "compile_project", "to_mjcf"]
