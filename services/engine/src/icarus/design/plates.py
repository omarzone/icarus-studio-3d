"""A floor plate compiles to a thin static geom lying on the floor at its object's origin. The physics treats it as a
floor patch (never an obstacle or a collision); sim/plates.py reads its contacts to tell when it is pressed."""

import xml.etree.ElementTree as ET

from icarus.contracts.objects import ObjectSpec
from icarus.design.components import view

PLATE_SUFFIX = ":plate"


def _fmt(values: list[float]) -> str:
    return " ".join(f"{float(value):.6g}" for value in values)


def _rgba(color: str) -> str:
    return _fmt([int(color[index : index + 2], 16) / 255 for index in (1, 3, 5)] + [1])


def add_plate(body: ET.Element, obj: ObjectSpec, dynamic: bool) -> None:
    plate = view(obj, "plate")
    if plate is None or dynamic:
        return
    width, depth, thickness = plate.vector("size")
    circle = plate.text("shape") == "circle"
    size = [width / 2, thickness / 2] if circle else [width / 2, depth / 2, thickness / 2]
    attributes = {
        "name": f"{obj.id}{PLATE_SUFFIX}",
        "type": "cylinder" if circle else "box",
        "size": _fmt(size),
        "pos": _fmt([0, 0, thickness / 2]),
        "mass": "0",
        "rgba": _rgba(plate.text("color")),
    }
    ET.SubElement(body, "geom", attributes)


def is_plate_name(name: str) -> bool:
    return name.endswith(PLATE_SUFFIX)
