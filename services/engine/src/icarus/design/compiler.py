import math
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

import mujoco
import numpy as np

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.project import Project
from icarus.contracts.scene import SceneSky
from icarus.design.compile_error import CompileError
from icarus.design.components import ComponentView, view
from icarus.design.decor import WorldDecor, world_decor
from icarus.design.looks import GeomLook, geom_looks
from icarus.design.plates import add_plate, is_plate_name
from icarus.design.sensors import add_actuator, add_sensors, goal_object, ray_labels, sensor_scales
from icarus.design.sky import add_sky, world_sky
from icarus.design.sun_path import SunPath, world_sun
from icarus.design.surfaces import SURFACE_FRICTION
from icarus.design.vehicle import VehicleLayout, add_vehicle_actuators, vehicle_layouts
from icarus.projects.document import all_objects, containers

TIMESTEP = 0.002
# A rectangular goal is a flat box on the ground; only its footprint counts.
GOAL_HALF_HEIGHT = 0.01
# A zone effect is a thin static floor patch whose contact settings win over whatever touches it (priority).
PATCH_THICKNESS = 0.004
PATCH_SUFFIX = ":patch"
# Slippery grips like ice; slow keeps normal grip but resists rolling, like mud, so wheels and balls labour on it.
ZONE_PATCHES: dict[str, dict[str, str]] = {
    "slippery": {"friction": "0.05 0.005 0.0001", "condim": "3", "rgba": "0.78 0.9 0.95 1"},
    "slow": {"friction": "1 0.05 0.03", "condim": "6", "rgba": "0.42 0.32 0.21 1"},
}


@dataclass(frozen=True)
class CompiledModel:
    mjcf: str
    model: mujoco.MjModel
    # Object id → MJCF body name.
    objects: dict[str, str]
    # How the world looks around it; None when the world has no sky object.
    sky: SceneSky | None = None
    # Object id → how its geom is drawn; never part of the physics.
    looks: dict[str, GeomLook] = field(default_factory=dict)
    # Rangefinder name → the name its rays carry in the brain, Play and the view.
    ray_labels: dict[str, str] = field(default_factory=dict)
    # Body root id → the vehicle it is, for bodies with a vehicle component.
    vehicles: dict[str, VehicleLayout] = field(default_factory=dict)
    # Speed and target sensor name → the reading the brain sees as 1.
    sensor_scales: dict[str, float] = field(default_factory=dict)
    # Object ids whose geom is a ground slab (a ground component).
    grounds: frozenset[str] = frozenset()
    # Floor plates, displays and eyes as the project sets them; their poses come from the model.
    decor: WorldDecor = field(default_factory=WorldDecor)


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


def _add_ground(body: ET.Element, obj: ObjectSpec, ground: ComponentView) -> None:
    """A static slab whose top is the object's height, so the drawn floor and the one bodies stand on agree."""
    if _is_dynamic(obj):
        raise CompileError(f"{obj.name} is the ground, and the ground can only be static")
    width, depth, thickness = ground.vector("size")
    attributes = {
        "name": obj.id,
        "type": "box",
        "size": _fmt([width / 2, depth / 2, thickness / 2]),
        "pos": _fmt([0, 0, -thickness / 2]),
        "mass": "0",
    }
    material = view(obj, "material")
    if material:
        attributes["rgba"] = _rgba(material.text("color"))
    friction = _friction(obj)
    if friction is not None:
        attributes["friction"] = _fmt([friction, 0.005, 0.0001])
    ET.SubElement(body, "geom", attributes)


def _add_geom(body: ET.Element, obj: ObjectSpec, scale: tuple[float, float, float]) -> None:
    ground = view(obj, "ground")
    if ground is not None:
        _add_ground(body, obj, ground)
        return
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
    elif physics is None and shape != "plane":
        # A static part without a collider is decoration painted on the world: nothing touches it.
        attributes |= {"contype": "0", "conaffinity": "0"}
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
    elif kind == "ball" and (low > -180 or high < 180):
        attributes["range"] = _fmt([0, math.radians(max(abs(low), abs(high)))])
    ET.SubElement(body, "joint", attributes)


def _add_light(body: ET.Element, obj: ObjectSpec, root: ET.Element, sun: SunPath | None) -> None:
    light = view(obj, "light")
    if light is None:
        return
    color = light.text("color")
    strength = min(light.number("intensity"), 1.0)
    diffuse = [int(color[index : index + 2], 16) / 255 * strength for index in (1, 3, 5)]
    is_sun = light.text("kind") == "sun"
    attributes = {"name": obj.id, "directional": "true" if is_sun else "false", "dir": "0.3 0.2 -1"}
    if not light.switch("shadows"):
        attributes["castshadow"] = "false"
    if is_sun and sun is not None:
        # On the clock the sun shines from the sky's hour, whatever the object's rotation, so it lives in the world.
        world = root.find("worldbody")
        body = body if world is None else world
        attributes["dir"] = _fmt(sun.direction)
        diffuse = [channel * tint for channel, tint in zip(diffuse, sun.tint, strict=True)]
    ET.SubElement(body, "light", attributes | {"diffuse": _fmt(diffuse)})


def _add_markers(body: ET.Element, obj: ObjectSpec) -> None:
    for kind, size in (("spawn_point", None), ("goal_zone", "radius"), ("zone", "size")):
        marker = view(obj, kind)
        if marker is None:
            continue
        attributes = {"name": f"{obj.id}:{kind}", "group": "4", "rgba": "0 0 0 0"}
        if kind == "goal_zone" and marker.text("shape") == "rectangle":
            half = [marker.number("length") / 2, marker.number("width") / 2, GOAL_HALF_HEIGHT]
            attributes |= {"type": "box", "size": _fmt(half)}
        elif size == "size":
            attributes |= {"type": "box", "size": _fmt([value / 2 for value in marker.vector("size")])}
        else:
            attributes |= {"type": "sphere", "size": _fmt([marker.number(size) if size else 0.1])}
        ET.SubElement(body, "site", attributes)


def _add_zone_patch(body: ET.Element, obj: ObjectSpec) -> None:
    zone = view(obj, "zone")
    patch = ZONE_PATCHES.get(zone.text("effect")) if zone else None
    if zone is None or patch is None or _is_dynamic(obj):
        return
    width, depth, _ = zone.vector("size")
    attributes = {
        "name": f"{obj.id}{PATCH_SUFFIX}",
        "type": "box",
        "size": _fmt([width / 2, depth / 2, PATCH_THICKNESS / 2]),
        "pos": _fmt([0, 0, PATCH_THICKNESS / 2]),
        "priority": "1",
        "mass": "0",
    }
    ET.SubElement(body, "geom", attributes | patch)


def is_floor_patch(model: mujoco.MjModel, geom: int) -> bool:
    name = model.geom(geom).name
    return name.endswith(PATCH_SUFFIX) or is_plate_name(name)


def is_ground(compiled: "CompiledModel", geom: int) -> bool:
    """The world's floor: an endless plane or a ground slab."""
    model = compiled.model
    return int(model.geom_type[geom]) == int(mujoco.mjtGeom.mjGEOM_PLANE) or model.geom(geom).name in compiled.grounds


def _add_body(
    parent: ET.Element,
    obj: ObjectSpec,
    children: dict[str | None, list[ObjectSpec]],
    root: ET.Element,
    sun: SunPath | None,
    goal: str | None = None,
):
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
    _add_light(body, obj, root, sun)
    _add_markers(body, obj)
    _add_zone_patch(body, obj)
    add_plate(body, obj, _is_dynamic(obj))
    add_sensors(body, root, obj, goal)
    for child in children.get(obj.id, []):
        _add_body(body, child, children, root, sun, goal)


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
    sun = world_sun(project)
    goal = goal_object(project)
    for objects in containers(project):
        children: dict[str | None, list[ObjectSpec]] = {}
        for obj in objects:
            children.setdefault(obj.parent, []).append(obj)
        for obj in children.get(None, []):
            _add_body(world, obj, children, root, sun, goal)
    vehicles = vehicle_layouts(project)
    owned = frozenset(item for layout in vehicles.values() for item in layout.owned)
    for obj in all_objects(project):
        add_actuator(root, obj, project, owned)
    for layout in vehicles.values():
        actuators = root.find("actuator")
        add_vehicle_actuators(actuators if actuators is not None else ET.SubElement(root, "actuator"), layout)
    return ET.tostring(root, encoding="unicode")


def compile_project(project: Project) -> CompiledModel:
    """Build the MuJoCo model of a structurally valid project."""
    mjcf = to_mjcf(project)
    try:
        model = mujoco.MjModel.from_xml_string(mjcf)
    except ValueError as error:
        raise CompileError(_readable(str(error), project)) from error
    objects = {obj.id: obj.id for obj in all_objects(project)}
    return CompiledModel(
        mjcf=mjcf,
        model=model,
        objects=objects,
        sky=world_sky(project),
        looks=geom_looks(project),
        ray_labels=ray_labels(project),
        vehicles=vehicle_layouts(project),
        sensor_scales=sensor_scales(project),
        grounds=frozenset(obj.id for obj in project.world.objects if view(obj, "ground")),
        decor=world_decor(project),
    )


__all__ = ["CompileError", "CompiledModel", "compile_project", "is_floor_patch", "is_ground", "to_mjcf"]
