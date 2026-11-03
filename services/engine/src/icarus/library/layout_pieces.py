"""What each element of a layout is made of: a library piece when one exists, else a styled primitive.

This table is the one place to swap a new piece in: list its id first under the element and every recipe uses it.
"""

import random
from dataclasses import dataclass

from icarus.contracts.objects import ComponentSpec, ObjectSpec
from icarus.contracts.properties import ColorValue, ListValue, VectorValue
from icarus.library.outdoor_pieces import crown
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
    "street_light": Look("Street light", ("street_light",), "cylinder", "#3a3f47", "pole", "metal", True),
    "tree": Look("Tree", ("tree",), "cylinder", "#6b4f36", "trunk", "wood", True),
    "grass": Look("Grass", (), "box", "#5f8f45", "plain", "grass", False),
    "sidewalk": Look("Sidewalk", ("sidewalk",), "box", "#c4c0b8", "sidewalk", "concrete", True),
    "crosswalk": Look("Crosswalk", ("crosswalk",), "box", "#eef0f2", "crosswalk", "concrete", False),
    "lane_dashes": Look("Dashed line", ("lane_dashes",), "box", "#eef0f2", "dashed_line", "concrete", False),
    "parking_mark": Look("Parking mark", ("parking_mark",), "box", "#eef0f2", "parking_mark", "concrete", False),
    "road_arrow": Look("Road arrow", ("road_arrow",), "box", "#eef0f2", "road_arrow", "concrete", False),
    "barrier_gate": Look("Barrier gate", ("barrier_gate",), "box", "#e2e2de", "gate_post", "metal", True),
    "parking_sign": Look("Parking sign", ("parking_sign",), "cylinder", "#8d939b", "pole", "metal", True),
    "pickup": Look("Pickup truck", ("pickup_truck",), "box", "#c9c4b8", "pickup", "metal", True),
    "hatchback": Look("Hatchback", ("hatchback",), "box", "#d6a23a", "hatchback", "metal", True),
    "suv": Look("SUV", ("suv",), "box", "#2b2d31", "suv", "metal", True),
    "trash_bin": Look("Litter bin", ("trash_bin",), "cylinder", "#2f5d46", "bin", "metal", True),
    "fire_hydrant": Look("Fire hydrant", ("fire_hydrant",), "cylinder", "#c8302c", "hydrant", "metal", True),
    "planter": Look("Planter", ("planter",), "box", "#b9b4ab", "planter", "concrete", True),
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
    "block": Look("Block", ("block",), "box", "#9aa0a8", "plain", "concrete", True),
}


# Crown shapes a seeded tree picks from (round ones most often), each with its width and trunk share of the height.
CROWNS = (
    ("crown_round", 0.62, 0.45),
    ("crown_round", 0.62, 0.45),
    ("crown_cone", 0.42, 0.3),
    ("crown_oval", 0.36, 0.4),
)
LEAF_GREENS = ("#4f8a3c", "#5d9640", "#3f7a36", "#6a9a45", "#47803f")


def leafy_tree(rng: random.Random, height: float) -> tuple[Vector3, dict[str, Raw]]:
    """A varied tree `height` metres tall: the trunk bodies bump into and the crown drawn as its ornament."""
    style, width, share = rng.choice(CROWNS)
    trunk = (round(0.22 + 0.02 * height, 3), round(0.22 + 0.02 * height, 3), round(height * share, 3))
    size = (round(width * height, 3), round(width * height, 3), round(height * (1 - share) + 0.6, 3))
    return trunk, crown(style, trunk, size, rng.choice(LEAF_GREENS))


def _piece_look(look: Look) -> ObjectSpec | None:
    return next((PIECES[piece].object for piece in look.pieces if piece in PIECES), None)


def _piece_ornaments(piece: ObjectSpec, size: Vector3) -> list[ComponentSpec]:
    """The piece's ornaments stretched along each axis as the element stretches the piece's own size."""
    mesh = next((item for item in piece.components if item.kind == "mesh"), None)
    own = mesh.properties.get("size") if mesh else None
    stretch = (
        tuple(new / old for new, old in zip(size, own.value, strict=True))
        if isinstance(own, VectorValue)
        else (1, 1, 1)
    )
    found: list[ComponentSpec] = []
    for item in piece.components:
        if item.kind != "ornament":
            continue
        copy = item.model_copy(deep=True)
        for prop in ("size", "offset"):
            value = copy.properties.get(prop)
            if isinstance(value, VectorValue):
                scaled = tuple(part * factor for part, factor in zip(value.value, stretch, strict=True))
                copy.properties[prop] = VectorValue(type="vector", value=(scaled[0], scaled[1], scaled[2]))
        found.append(copy)
    return found


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
    ornament: dict[str, Raw] | None = None,
) -> ObjectSpec:
    """One static element at a place and size: the size is the layout's, the drawing the piece's or the style's. An
    ornament given here replaces the piece's, which otherwise follows the element's size."""
    look = LOOKS[kind]
    components: dict[str, dict[str, Raw]] = {
        "transform": {"position": position, "rotation": rotation},
        "mesh": {"shape": look.shape, "size": size},
        "material": {"color": color or look.color, "style": look.style, "surface": surface or look.surface},
    }
    if look.solid:
        components["physics_body"] = {"mode": "static"}
        components["collider"] = {}
    if ornament:
        components["ornament"] = ornament
    spec = Part(id, name, parent, components).spec()
    piece = _piece_look(look)
    if piece is None:
        return spec
    if not ornament:
        spec.components += _piece_ornaments(piece, size)
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
