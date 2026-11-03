import math
import xml.etree.ElementTree as ET
from dataclasses import dataclass

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.project import Project
from icarus.design.compile_error import CompileError
from icarus.design.components import ComponentView, components_of, view
from icarus.projects.document import all_objects, find_object

FULL_CIRCLE = 360.0
SPEED_SUFFIX = ":speed"
YAW_SUFFIX = ":speed:yaw"
TARGET_SUFFIX = ":target"
HEADING_SUFFIX = ":target:heading"


@dataclass(frozen=True)
class RaySite:
    """One rangefinder of a distance ray: its site name, the name the brain and Play show, and where it looks."""

    site: str
    label: str
    # Degrees around the part's up axis, above zero to the left.
    heading: float
    tilt: float
    range: float


def _direction(heading: float) -> str:
    degrees = round((heading + 180) % 360 - 180)
    if degrees == 0:
        return "ahead"
    if abs(degrees) == 180:
        return "behind"
    return f"{degrees}° left" if degrees > 0 else f"{-degrees}° right"


def _base_label(obj: ObjectSpec, name: str, order: int) -> str:
    if name.strip():
        return name.strip()
    return f"{obj.name} distance" if order == 0 else f"{obj.name} distance {order + 1}"


def _fan_offset(spread: float, rays: int, index: int) -> float:
    """Degrees from the heading of one ray of a fan; a full circle spaces them evenly without doubling the back."""
    if rays == 1:
        return 0.0
    if spread >= FULL_CIRCLE:
        return FULL_CIRCLE * index / rays
    return -spread / 2 + spread * index / (rays - 1)


def ray_sites(obj: ObjectSpec) -> list[RaySite]:
    """Every ray of the object's distance rays in observation order; the first keeps the site names it always had."""
    sites: list[RaySite] = []
    for order, component in enumerate(components_of(obj, "distance_ray")):
        ray = ComponentView(component)
        rays = ray.count("count")
        prefix = obj.id if order == 0 else f"{obj.id}:{component.id}"
        base = _base_label(obj, ray.text("name"), order)
        spread = ray.number("spread")
        for index in range(rays):
            heading = ray.number("heading") + _fan_offset(spread, rays, index)
            label = base if rays == 1 else f"{base} {_direction(heading)}"
            sites.append(RaySite(f"{prefix}:ray{index}", label, heading, ray.number("tilt"), ray.number("range")))
    return sites


def component_sensors(obj: ObjectSpec, component_id: str) -> frozenset[str]:
    """The MuJoCo sensor names one sense component of the object adds, as add_sensors names them."""
    component = next((item for item in obj.components if item.id == component_id), None)
    if component is None:
        return frozenset()
    match component.kind:
        case "distance_ray":
            rays = [item.id for item in components_of(obj, "distance_ray")]
            prefix = obj.id if rays.index(component.id) == 0 else f"{obj.id}:{component.id}"
            return frozenset(site.site for site in ray_sites(obj) if site.site.rsplit(":", 1)[0] == prefix)
        case "balance":
            return frozenset({f"{obj.id}:balance:accel", f"{obj.id}:balance:gyro"})
        case "touch":
            return frozenset({f"{obj.id}:touch"})
        case "speed":
            return frozenset({f"{obj.id}{SPEED_SUFFIX}", f"{obj.id}{YAW_SUFFIX}"})
        case "target":
            return frozenset({f"{obj.id}{TARGET_SUFFIX}", f"{obj.id}{HEADING_SUFFIX}"})
        case _:
            return frozenset()


def ray_labels(project: Project) -> dict[str, str]:
    """Rangefinder site name → the name its rays carry, for every object in the project."""
    return {site.site: site.label for obj in all_objects(project) for site in ray_sites(obj)}


def _fmt(values) -> str:
    return " ".join(f"{float(value):.6g}" for value in values)


def _section(root: ET.Element, tag: str) -> ET.Element:
    section = root.find(tag)
    return section if section is not None else ET.SubElement(root, tag)


def add_sensors(body: ET.Element, root: ET.Element, obj: ObjectSpec, goal: str | None = None) -> None:
    """Sites on the body and their sensors in the model's sensor section."""
    for ray in ray_sites(obj):
        tilt, angle = math.radians(ray.tilt), math.radians(ray.heading)
        zaxis = (math.cos(tilt) * math.cos(angle), math.cos(tilt) * math.sin(angle), math.sin(tilt))
        ET.SubElement(body, "site", {"name": ray.site, "zaxis": _fmt(zaxis), "size": "0.01", "group": "4"})
        ET.SubElement(
            _section(root, "sensor"), "rangefinder", {"name": ray.site, "site": ray.site, "cutoff": _fmt([ray.range])}
        )
    balance = view(obj, "balance")
    if balance:
        site = f"{obj.id}:balance"
        ET.SubElement(body, "site", {"name": site, "size": "0.01", "group": "4"})
        sensors = _section(root, "sensor")
        if balance.text("includes") == "accel+gyro":
            ET.SubElement(sensors, "accelerometer", {"name": f"{site}:accel", "site": site})
        ET.SubElement(sensors, "gyro", {"name": f"{site}:gyro", "site": site})
    touch = view(obj, "touch")
    if touch:
        site = f"{obj.id}:touch"
        ET.SubElement(body, "site", {"name": site, "size": _fmt([touch.number("radius")]), "group": "4"})
        ET.SubElement(_section(root, "sensor"), "touch", {"name": site, "site": site})
    _add_motion_sensors(body, root, obj, goal)


def _add_motion_sensors(body: ET.Element, root: ET.Element, obj: ObjectSpec, goal: str | None) -> None:
    """Speed reads the part's own velocity and turn rate; target reads where the goal zone is and which way it
    faces, both in the part's frame, as MuJoCo's frame sensors compute them."""
    if view(obj, "speed"):
        site = f"{obj.id}{SPEED_SUFFIX}"
        ET.SubElement(body, "site", {"name": site, "size": "0.01", "group": "4"})
        sensors = _section(root, "sensor")
        ET.SubElement(sensors, "velocimeter", {"name": site, "site": site})
        ET.SubElement(sensors, "gyro", {"name": f"{obj.id}{YAW_SUFFIX}", "site": site})
    if view(obj, "target") and goal is not None:
        site = f"{obj.id}{TARGET_SUFFIX}"
        ET.SubElement(body, "site", {"name": site, "size": "0.01", "group": "4"})
        goal_site = {"objtype": "site", "objname": f"{goal}:goal_zone", "reftype": "site", "refname": site}
        sensors = _section(root, "sensor")
        ET.SubElement(sensors, "framepos", {"name": site} | goal_site)
        ET.SubElement(sensors, "framexaxis", {"name": f"{obj.id}{HEADING_SUFFIX}"} | goal_site)


def sensor_scales(project: Project) -> dict[str, float]:
    """Speed and target sensor name → the reading the brain sees as 1."""
    scales: dict[str, float] = {}
    for obj in all_objects(project):
        speed, target = view(obj, "speed"), view(obj, "target")
        if speed:
            scales[f"{obj.id}{SPEED_SUFFIX}"] = speed.number("scale")
        if target:
            scales[f"{obj.id}{TARGET_SUFFIX}"] = target.number("range")
    return scales


def goal_object(project: Project) -> str | None:
    return next((obj.id for obj in all_objects(project) if view(obj, "goal_zone")), None)


def add_actuator(root: ET.Element, obj: ObjectSpec, project: Project, owned: frozenset[str] = frozenset()) -> None:
    """The motor component's actuator, unless a vehicle drives that joint itself."""
    motor = view(obj, "motor")
    if motor is None:
        return
    target_id = motor.text("joint") or obj.id
    if target_id in owned:
        return
    found = find_object(project, target_id)
    joint = view(found[1], "joint") if found else None
    if joint is None or joint.text("kind") in {"ball", "fixed"}:
        raise CompileError(f"The motor on {obj.name} needs a hinge or slide joint to drive")
    force = motor.number("max_force")
    gear = motor.number("gear")
    attributes = {"name": f"{obj.id}:motor", "joint": f"{target_id}:joint"}
    if motor.text("kind") == "torque":
        attributes |= {"ctrlrange": "-1 1", "gear": _fmt([force * gear])}
        ET.SubElement(_section(root, "actuator"), "motor", attributes)
        return
    low, high = joint.span("limits")
    if joint.text("kind") == "hinge":
        low, high = (math.radians(low), math.radians(high)) if (low > -180 or high < 180) else (-math.pi, math.pi)
    attributes |= {"ctrlrange": _fmt([low, high]), "kp": _fmt([force]), "dampratio": "1", "gear": _fmt([gear])}
    if force > 0:
        attributes["forcerange"] = _fmt([-force, force])
    ET.SubElement(_section(root, "actuator"), "position", attributes)
