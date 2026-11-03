"""Trees, street furniture, road paint and vehicles for outdoor scenes.

A piece's collider is what bodies bump into and its style draws inside it (ADR 007). What reaches past a thin collider,
such as a crown above a trunk or a lamp's arm, is an ornament: drawn at its own size, never compiled into the physics.
Road paint has no collider at all.
"""

from icarus.contracts.library import PieceCategory, PieceInfo
from icarus.library.parts import Part, Raw, decoration, fixture

Size = tuple[float, float, float]
# Where a piece stands when placed from the library: 3 m ahead of the origin.
AHEAD = 3.0
LEAVES = "#4f8a3c"
LAMP_LIGHT = "#fff0c8"


def _piece(id: str, label: str, icon: str, category: PieceCategory, description: str, part: Part) -> PieceInfo:
    return PieceInfo(id=id, label=label, icon=icon, category=category, description=description, object=part.spec())


def _fixed(
    id: str,
    name: str,
    shape: str,
    size: Size,
    color: str,
    style: str,
    surface: str,
    *,
    look: dict[str, Raw] | None = None,
    ornament: dict[str, Raw] | None = None,
) -> Part:
    """A static piece standing on the ground; bodies bump into its whole shape, never into its ornament."""
    part = fixture(id, name, None, (AHEAD, 0, size[2] / 2), shape, size, color, style=style, surface=surface)
    part.components["material"] |= look or {}
    if ornament:
        part.components["ornament"] = ornament
    return part


def _paint(id: str, name: str, size: Size, style: str, color: str = "#eef0f2") -> Part:
    """Paint on the ground without a collider: wheels and feet pass over it."""
    return decoration(id, name, None, (AHEAD, 0, size[2] / 2), "box", size, color, style=style)


def crown(style: str, trunk: Size, size: Size, color: str = LEAVES, sink: float = 0.6) -> dict[str, Raw]:
    """A crown of leaves whose bottom sits `sink` metres below the top of a trunk of size `trunk`."""
    return {"style": style, "size": size, "offset": (0, 0, trunk[2] / 2 - sink + size[2] / 2), "color": color}


def lamp_arm(pole: Size, reach: float = 2.0) -> dict[str, Raw]:
    """An arm reaching `reach` metres along +X from the top of a pole, with a glowing head at its end."""
    arm: Size = (reach, 0.4, 0.45)
    return {
        "style": "lamp_arm",
        "size": arm,
        "offset": (reach / 2, 0, pole[2] / 2 - arm[2] / 2 + 0.05),
        "color": "#3a3f47",
        "accent": LAMP_LIGHT,
        "emissive": 1,
    }


def gate_arm(post: Size, length: float = 3.6, raised: bool = True) -> dict[str, Raw]:
    """A striped boom pivoting on top of a gate post: raised straight up, or lowered along +X across the lane."""
    pivot = post[2] / 2 - 0.12
    if raised:
        return {
            "style": "gate_arm",
            "size": (length, 0.12, 0.12),
            "offset": (0.12, 0, pivot + length / 2),
            "rotation": (0, -90, 0),
            "color": "#d0342c",
            "accent": "#f4f4f4",
        }
    return {
        "style": "gate_arm",
        "size": (length, 0.12, 0.12),
        "offset": (length / 2 + post[0] / 2, 0, pivot),
        "color": "#d0342c",
        "accent": "#f4f4f4",
    }


TRUNK: Size = (0.35, 0.35, 3.0)
PINE_TRUNK: Size = (0.3, 0.3, 2.2)
POPLAR_TRUNK: Size = (0.3, 0.3, 2.6)
POLE: Size = (0.22, 0.22, 6.0)
GATE_POST: Size = (0.45, 0.45, 1.1)
SIGN_POLE: Size = (0.08, 0.08, 2.4)
PLANTER: Size = (1.6, 0.8, 0.5)

OUTDOOR_PIECES = [
    # Nature
    _piece(
        "tree",
        "Tree",
        "terrain",
        "nature",
        "A leafy tree about 5.8 m tall: bodies bump into its 35 cm trunk, and its crown 3.6 m across is drawn only.",
        _fixed(
            "tree",
            "Tree",
            "cylinder",
            TRUNK,
            "#6b4f36",
            "trunk",
            "wood",
            ornament=crown("crown_round", TRUNK, (3.6, 3.6, 3.4)),
        ),
    ),
    _piece(
        "pine_tree",
        "Pine tree",
        "terrain",
        "nature",
        "A pine about 6.6 m tall: bodies bump into its 30 cm trunk, and its cone of needles is drawn only.",
        _fixed(
            "pine_tree",
            "Pine tree",
            "cylinder",
            PINE_TRUNK,
            "#5e4632",
            "trunk",
            "wood",
            ornament=crown("crown_cone", PINE_TRUNK, (2.8, 2.8, 5.0), "#2f6b3a", sink=0.6),
        ),
    ),
    _piece(
        "poplar_tree",
        "Poplar",
        "terrain",
        "nature",
        "A slim poplar about 6.6 m tall: bodies bump into its 30 cm trunk, and its tall crown is drawn only.",
        _fixed(
            "poplar_tree",
            "Poplar",
            "cylinder",
            POPLAR_TRUNK,
            "#6b5a44",
            "trunk",
            "wood",
            ornament=crown("crown_oval", POPLAR_TRUNK, (2.2, 2.2, 4.6), "#5d9640"),
        ),
    ),
    # Street furniture
    _piece(
        "street_light",
        "Street light",
        "sun",
        "street",
        "A street light 6 m tall with an arm and a glowing head 2 m out; bodies bump into its pole only. It lights "
        "nothing until a point light is added.",
        _fixed("street_light", "Street light", "cylinder", POLE, "#3a3f47", "pole", "metal", ornament=lamp_arm(POLE)),
    ),
    _piece(
        "barrier_gate",
        "Barrier gate",
        "lines",
        "street",
        "A parking barrier gate: a 1.1 m post bodies bump into, with its red and white boom raised and drawn only.",
        _fixed(
            "barrier_gate",
            "Barrier gate",
            "box",
            GATE_POST,
            "#e2e2de",
            "gate_post",
            "metal",
            ornament=gate_arm(GATE_POST),
        ),
    ),
    _piece(
        "parking_sign",
        "Parking sign",
        "target",
        "street",
        "A blue parking sign with a white P on a 2.4 m pole; bodies bump into the pole, the plate is drawn only.",
        _fixed(
            "parking_sign",
            "Parking sign",
            "cylinder",
            SIGN_POLE,
            "#8d939b",
            "pole",
            "metal",
            ornament={
                "style": "sign_plate",
                "size": (0.05, 0.6, 0.6),
                "offset": (0.06, 0, SIGN_POLE[2] / 2 - 0.35),
                "color": "#2f5fb3",
                "accent": "#ffffff",
            },
        ),
    ),
    _piece(
        "trash_bin",
        "Litter bin",
        "box",
        "street",
        "A fixed street litter bin 0.95 m tall.",
        _fixed("trash_bin", "Litter bin", "cylinder", (0.55, 0.55, 0.95), "#2f5d46", "bin", "metal"),
    ),
    _piece(
        "fire_hydrant",
        "Fire hydrant",
        "target",
        "street",
        "A red fire hydrant 0.8 m tall that keeps its place.",
        _fixed("fire_hydrant", "Fire hydrant", "cylinder", (0.35, 0.35, 0.8), "#c8302c", "hydrant", "metal"),
    ),
    _piece(
        "planter",
        "Planter",
        "grid",
        "street",
        "A concrete planter 1.6 m long and 0.5 m tall; bodies bump into the box, its plants are drawn only.",
        _fixed(
            "planter",
            "Planter",
            "box",
            PLANTER,
            "#b9b4ab",
            "planter",
            "concrete",
            ornament={
                "style": "shrubs",
                "size": (1.4, 0.62, 0.6),
                "offset": (0, 0, PLANTER[2] / 2 + 0.25),
                "color": LEAVES,
                "accent": "#e07a96",
            },
        ),
    ),
    # Road paint
    _piece(
        "crosswalk",
        "Crosswalk",
        "lines",
        "street",
        "Zebra stripes painted across a 7 m road: each stripe runs 3 m along X and they repeat across Y. Paint only.",
        _paint("crosswalk", "Crosswalk", (3, 7, 0.01), "crosswalk"),
    ),
    _piece(
        "lane_dashes",
        "Dashed lane line",
        "lines",
        "street",
        "A dashed center line 12 m long: 3 m dashes and 3 m gaps along its length. Paint only.",
        _paint("lane_dashes", "Dashed lane line", (12, 0.15, 0.01), "dashed_line"),
    ),
    _piece(
        "parking_mark",
        "Parking mark",
        "lines",
        "street",
        "A large P painted on the ground, its top toward +X. Paint only.",
        _paint("parking_mark", "Parking mark", (1.6, 1.2, 0.01), "parking_mark"),
    ),
    _piece(
        "road_arrow",
        "Road arrow",
        "lines",
        "street",
        "A straight arrow painted on a lane, pointing along +X. Paint only.",
        _paint("road_arrow", "Road arrow", (2.6, 0.9, 0.01), "road_arrow"),
    ),
    # Vehicles
    _piece(
        "pickup_truck",
        "Pickup truck",
        "car",
        "street",
        "A parked pickup truck 5.3 m long that does not move: a fixed box drawn as a cab, an open bed and wheels.",
        _fixed("pickup_truck", "Pickup truck", "box", (5.3, 2.0, 1.85), "#c9c4b8", "pickup", "metal"),
    ),
    _piece(
        "hatchback",
        "Hatchback",
        "car",
        "street",
        "A parked small hatchback 3.9 m long that does not move: a fixed box drawn as the car with its wheels.",
        _fixed("hatchback", "Hatchback", "box", (3.9, 1.75, 1.5), "#d6a23a", "hatchback", "metal"),
    ),
    _piece(
        "suv",
        "SUV",
        "car",
        "street",
        "A parked SUV 4.7 m long that does not move: a fixed tall box drawn as the car with its wheels.",
        _fixed("suv", "SUV", "box", (4.7, 1.9, 1.75), "#2b2d31", "suv", "metal"),
    ),
]
