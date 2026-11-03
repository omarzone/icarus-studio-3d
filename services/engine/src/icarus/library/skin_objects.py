import math
import re
from typing import Literal

from icarus.contracts.objects import ObjectSpec
from icarus.library.parts import Part, Raw

# A stored model's id: "sk" and the start of its content's SHA-256 (projects/skins.py keeps the files).
SKIN_ID = re.compile(r"^sk[0-9a-f]{16}$")
# A model whose longest side reads as metres within this range keeps its size; anything else becomes 1 m long.
_METRES = (0.05, 50.0)
_SMALLEST = 0.01
_MASS = (0.001, 10_000.0)
_COLOR = "#9aa0a8"


def skin_size(bounds: tuple[float, float, float], length: float | None) -> tuple[float, float, float]:
    """The model's extents in metres: scaled so its longest side is `length`, or as authored when that reads as
    metres."""
    longest = max(bounds)
    target = length if length is not None else (longest if _METRES[0] <= longest <= _METRES[1] else 1.0)
    scale = target / longest if longest > 0 else 1.0
    x, y, z = (max(value * scale, _SMALLEST) for value in bounds)
    return (x, y, z)


def collider_size(size: tuple[float, float, float], collider: Literal["box", "capsule"]) -> tuple[float, float, float]:
    """A box the model's size, or an upright capsule as wide as its widest side and at least as tall."""
    if collider == "box":
        return size
    width = max(size[0], size[1])
    return (width, width, max(size[2], width))


def collider_volume(size: tuple[float, float, float], collider: Literal["box", "capsule"]) -> float:
    if collider == "box":
        return size[0] * size[1] * size[2]
    radius = size[0] / 2
    return math.pi * radius**2 * (size[2] - 2 * radius) + 4 / 3 * math.pi * radius**3


def skin_object(
    id: str,
    name: str,
    asset: str,
    size: tuple[float, float, float],
    *,
    position: tuple[float, float, float],
    collider: Literal["box", "capsule"],
    mode: Literal["dynamic", "static"],
    density: float,
) -> ObjectSpec:
    """An object whose collider is fitted to a model's size and that wears the model as its skin."""
    shape = collider_size(size, collider)
    mass = min(max(density * collider_volume(shape, collider), _MASS[0]), _MASS[1])
    physics: dict[str, Raw] = {"mode": "dynamic", "mass": round(mass, 3), "density": density}
    components: dict[str, dict[str, Raw]] = {
        "transform": {"position": (position[0], position[1], position[2] + shape[2] / 2)},
        "mesh": {"shape": collider, "size": shape},
        "material": {"color": _COLOR},
        "physics_body": physics if mode == "dynamic" else {"mode": "static"},
        "collider": {},
        "skin": {"asset": asset},
    }
    return Part(id, name, None, components).spec()
