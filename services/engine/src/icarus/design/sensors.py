import math
import xml.etree.ElementTree as ET

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.project import Project
from icarus.design.compile_error import CompileError
from icarus.design.components import view
from icarus.projects.document import find_object

RAY_FAN_DEG = 30.0


def _fmt(values) -> str:
    return " ".join(f"{float(value):.6g}" for value in values)


def _section(root: ET.Element, tag: str) -> ET.Element:
    section = root.find(tag)
    return section if section is not None else ET.SubElement(root, tag)


def add_sensors(body: ET.Element, root: ET.Element, obj: ObjectSpec) -> None:
    """Sites on the body and their sensors in the model's sensor section."""
    ray = view(obj, "distance_ray")
    if ray:
        rays = ray.count("count")
        for index in range(rays):
            angle = 0.0 if rays == 1 else math.radians(-RAY_FAN_DEG + 2 * RAY_FAN_DEG * index / (rays - 1))
            site = f"{obj.id}:ray{index}"
            zaxis = (math.cos(angle), math.sin(angle), 0.0)
            ET.SubElement(body, "site", {"name": site, "zaxis": _fmt(zaxis), "size": "0.01", "group": "4"})
            ET.SubElement(
                _section(root, "sensor"),
                "rangefinder",
                {"name": site, "site": site, "cutoff": _fmt([ray.number("range")])},
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


def add_actuator(root: ET.Element, obj: ObjectSpec, project: Project) -> None:
    motor = view(obj, "motor")
    if motor is None:
        return
    target_id = motor.text("joint") or obj.id
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
    attributes |= {
        "ctrlrange": _fmt([low, high]),
        "kp": _fmt([max(force, 1e-6)]),
        "forcerange": _fmt([-force, force]),
        "gear": _fmt([gear]),
    }
    ET.SubElement(_section(root, "actuator"), "position", attributes)
