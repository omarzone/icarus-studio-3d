"""What each element of a layout is made of: a library piece when one exists, else a styled primitive.

This table is the one place to swap a new piece in: list its id first under the element and every recipe uses it.
"""

from dataclasses import dataclass

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.properties import ColorValue, ListValue
from icarus.library.parts import Part, Raw
from icarus.library.pieces import PIECES

Vector3 = tuple[float, float, float]


@dataclass(frozen=True)
class Look:
    label: str
    # Piece ids to take the look from, in order of preference; the first one the library has wins.
    pieces: tuple[str, ...]
    shape: str
    color: str
    style: str
    surface: str
    # Something to bump into; otherwise only drawn, like paint or a floor patch.
    solid: bool


LOOKS: dict[str, Look] = {
    "floor": Look("Floor", (), "box", "#3a3f47", "plain", "asphalt", False),
    "marking": Look("Marking", (), "box", "#e8eaed", "marking", "concrete", False),
    "parked_car": Look("Parked car", ("parked_car",), "box", "#c8553d", "car_body", "metal", True),
    "curb": Look("Curb", ("curb",), "box", "#b9bcc2", "curb", "concrete", True),
    "lamp_post": Look("Lamp post", ("lamp_post", "street_lamp"), "cylinder", "#4b5058", "lamp_post", "metal", True),
    "tree": Look("Tree", ("tree",), "cylinder", "#3f7d3a", "tree", "wood", True),
    "rock": Look("Rock", ("rock", "boulder"), "box", "#7d7f84", "plain", "concrete", True),
    "building": Look("Building", ("building",), "box", "#c9c2b8", "wall", "concrete", True),
    "wall": Look("Wall", ("wall",), "box", "#9ca3af", "wall", "concrete", True),
    "crate": Look("Crate", ("crate", "box"), "box", "#b08d57", "crate", "wood", True),
    "shelf": Look("Shelving", ("shelf", "shelving"), "box", "#5d6b7a", "plain", "metal", True),
    "table": Look("Table", ("table",), "box", "#8b6a4e", "plain", "wood", True),
    "sofa": Look("Sofa", ("sofa",), "box", "#5c6f8a", "plain", "rubber", True),
    "cabinet": Look("Cabinet", ("cabinet",), "box", "#a38b6d", "plain", "wood", True),
    "bed": Look("Bed", ("bed",), "box", "#d8d2c8", "plain", "rubber", True),
    "barrier": Look("Barrier", ("barrier",), "box", "#d9534f", "wall", "concrete", True),
    "cone": Look("Cone", ("cone", "traffic_cone"), "cylinder", "#f08a24", "cone", "rubber", True),
    "post": Look("Post", ("post",), "cylinder", "#f0a63a", "post", "metal", True),
    "bench": Look("Bench", ("bench",), "box", "#7a5a3c", "plain", "wood", True),
    "ramp": Look("Ramp", ("ramp",), "box", "#6b7280", "plain", "concrete", True),
    "step": Look("Step", ("step", "stairs"), "box", "#8a8f98", "plain", "concrete", True),
}


def _piece_look(look: Look) -> ObjectSpec | None:
    return next((PIECES[piece].object for piece in look.pieces if piece in PIECES), None)


def element(
    kind: str,
    id: str,
    name: str,
    parent: str | None,
    position: Vector3,
    size: Vector3,
    *,
    rotation: Vector3 = (0, 0, 0),
    color: str | None = None,
    surface: str | None = None,
) -> ObjectSpec:
    """One static element at a place and size: the size is the layout's, the drawing the piece's or the style's."""
    look = LOOKS[kind]
    components: dict[str, dict[str, Raw]] = {
        "transform": {"position": position, "rotation": rotation},
        "mesh": {"shape": look.shape, "size": size},
        "material": {"color": color or look.color, "style": look.style, "surface": surface or look.surface},
    }
    if look.solid:
        components["physics_body"] = {"mode": "static"}
        components["collider"] = {}
    spec = Part(id, name, parent, components).spec()
    piece = _piece_look(look)
    if piece is None:
        return spec
    # The piece brings its look; place and size stay the layout's so the path check holds.
    material = next((item for item in piece.components if item.kind == "material"), None)
    if material is not None:
        material = material.model_copy(deep=True, update={"id": "material"})
        if color:
            material.properties["color"] = ColorValue(type="color", value=color)
    mesh = next(item for item in spec.components if item.kind == "mesh")
    shape = next((item for item in piece.components if item.kind == "mesh"), None)
    if shape is not None and "shape" in shape.properties:
        mesh.properties["shape"] = shape.properties["shape"]
    if material is not None:
        spec.components = [material if item.kind == "material" else item for item in spec.components]
    if surface:
        found = next(item for item in spec.components if item.kind == "material")
        found.properties["surface"] = ListValue(type="list", value=surface)
    return spec
