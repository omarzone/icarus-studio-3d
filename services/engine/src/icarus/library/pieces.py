from icarus.contracts.library import PieceCategory, PieceInfo
from icarus.library.parts import Part, Raw, fixture, solid

Size = tuple[float, float, float]

# A block's look: a tile per metre on every face and edges rounded inside its collider, which stays a sharp cube.
BLOCK_LOOK: dict[str, Raw] = {"finish": "blocks", "bevel": 0.04}


def _height(shape: str, size: Size) -> float:
    return size[0] if shape == "sphere" else size[2]


def _fixed(
    id: str,
    name: str,
    shape: str,
    size: Size,
    color: str,
    style: str,
    surface: str,
    *,
    z: float | None = None,
    rotation: Size = (0, 0, 0),
    look: dict[str, Raw] | None = None,
) -> Part:
    """A static piece resting on the ground 3 m ahead; its collider is its whole shape."""
    height = _height(shape, size) / 2 if z is None else z
    part = fixture(id, name, None, (3, 0, height), shape, size, color, style=style, surface=surface, rotation=rotation)
    part.components["material"] |= look or {}
    return part


def _static(part: Part) -> Part:
    part.components["physics_body"] = {"mode": "static"}
    return part


def _movable(id: str, name: str, shape: str, size: Size, mass: float, color: str, style: str, surface: str) -> Part:
    """A dynamic piece that can be pushed, knocked over or rolled."""
    part = solid(id, name, None, (3, 0, _height(shape, size) / 2), shape, size, mass, color, style=style)
    part.components["material"] |= {"surface": surface}
    return part


def _piece(id: str, label: str, icon: str, category: PieceCategory, description: str, part: Part) -> PieceInfo:
    return PieceInfo(id=id, label=label, icon=icon, category=category, description=description, object=part.spec())


# The physics sees each piece's whole shape: nothing passes under a table or between a fence's rails. The style only
# draws the detail inside that shape (ADR 007), and the surface sets the friction.
_PIECES = [
    # Basics
    _piece(
        "box",
        "Box obstacle",
        "box",
        "basics",
        "A movable crate to push or avoid.",
        solid("box", "Box", None, (3, 0, 0.25), "box", (0.5, 0.5, 0.5), 5, "#b08d57", style="crate"),
    ),
    _piece(
        "ramp",
        "Ramp",
        "terrain",
        "basics",
        "A fixed slope to climb.",
        _static(solid("ramp", "Ramp", None, (3, 0, 0.25), "box", (2, 1.5, 0.1), 1, "#6b7280", rotation=(0, -15, 0))),
    ),
    _piece(
        "wall",
        "Wall",
        "walls",
        "basics",
        "A fixed wall that blocks the way.",
        _static(solid("wall", "Wall", None, (3, 0, 0.5), "box", (0.2, 3, 1), 1, "#9ca3af", style="wall")),
    ),
    _piece(
        "post",
        "Post",
        "target",
        "basics",
        "A fixed post to steer around.",
        _static(solid("post", "Post", None, (3, 0, 0.5), "cylinder", (0.2, 0.2, 1), 1, "#f0a63a", style="post")),
    ),
    _piece(
        "ball",
        "Ball",
        "goal",
        "basics",
        "A light ball that rolls.",
        solid("ball", "Ball", None, (3, 0, 0.15), "sphere", (0.3, 0.3, 0.3), 0.5, "#d9534f", style="ball"),
    ),
    _piece(
        "platform",
        "Platform",
        "terrain",
        "basics",
        "A raised concrete floor 0.5 m high to climb onto or jump down from.",
        _fixed("platform", "Platform", "box", (3, 3, 0.5), "#a3a3a3", "slab", "concrete"),
    ),
    _piece(
        "pillar",
        "Pillar",
        "target",
        "basics",
        "A round stone column 3 m tall that holds up nothing and blocks the way.",
        _fixed("pillar", "Pillar", "cylinder", (0.5, 0.5, 3), "#d6d3cd", "pillar", "concrete"),
    ),
    _piece(
        "step",
        "Step",
        "terrain",
        "basics",
        "One stair step 17 cm high; stack copies each 0.3 m further and 0.17 m higher for real steps.",
        _fixed("step", "Step", "box", (0.3, 1.2, 0.17), "#b8b5ae", "step", "concrete"),
    ),
    _piece(
        "stairs",
        "Stairs",
        "terrain",
        "basics",
        "A flight of stairs rising 1.4 m at 30°; the physics sees a smooth incline, so climbing it is a slope.",
        _fixed(
            "stairs", "Stairs", "box", (2.4, 1.2, 0.3), "#b8b5ae", "stairs", "concrete", z=0.65, rotation=(0, -30, 0)
        ),
    ),
    _piece(
        "block",
        "Block",
        "box",
        "basics",
        "A fixed 1 m cube drawn as a tile block with rounded edges; repeat it with a grid or a line to build floors, "
        "platforms, steps and walls from blocks.",
        _fixed("block", "Block", "box", (1, 1, 1), "#9aa0a8", "plain", "concrete", look=BLOCK_LOOK),
    ),
    _piece(
        "sphere",
        "Sphere",
        "goal",
        "basics",
        "A fixed round boulder 1 m across to steer around or climb against.",
        _fixed("sphere", "Sphere", "sphere", (1, 1, 1), "#a8a29e", "plain", "concrete"),
    ),
    _piece(
        "bridge_plank",
        "Bridge plank",
        "lines",
        "basics",
        "A narrow wooden plank 3 m long to cross a gap; rest its ends on two platforms.",
        _fixed("bridge_plank", "Bridge plank", "box", (3, 0.8, 0.08), "#9c7448", "planks", "wood"),
    ),
    # Street
    _piece(
        "curb",
        "Curb",
        "lines",
        "street",
        "A low concrete curb 15 cm high along a road edge.",
        _fixed("curb", "Curb", "box", (4, 0.3, 0.15), "#bdbab3", "curb", "concrete"),
    ),
    _piece(
        "sidewalk",
        "Sidewalk slab",
        "grid",
        "street",
        "A paved sidewalk 4 by 2 m and 12 cm high beside a road.",
        _fixed("sidewalk", "Sidewalk", "box", (4, 2, 0.12), "#c4c0b8", "slab", "concrete", look={"finish": "tiles"}),
    ),
    _piece(
        "speed_bump",
        "Speed bump",
        "terrain",
        "street",
        "A rubber hump 8 cm high across a 3 m lane that jolts anything driving over it fast.",
        _fixed("speed_bump", "Speed bump", "box", (0.5, 3, 0.08), "#e0b000", "speed_bump", "rubber"),
    ),
    _piece(
        "wheel_stop",
        "Wheel stop",
        "lines",
        "street",
        "A concrete block 12 cm high at the end of a parking space that stops the wheels.",
        _fixed("wheel_stop", "Wheel stop", "box", (0.2, 1.8, 0.12), "#d4d0c8", "wheel_stop", "concrete"),
    ),
    _piece(
        "bollard",
        "Bollard",
        "target",
        "street",
        "A fixed steel bollard 0.9 m tall that keeps vehicles out.",
        _fixed("bollard", "Bollard", "cylinder", (0.18, 0.18, 0.9), "#3f4650", "post", "metal"),
    ),
    _piece(
        "traffic_cone",
        "Traffic cone",
        "target",
        "street",
        "A light 2 kg cone 0.7 m tall that tips over when hit.",
        _movable("traffic_cone", "Traffic cone", "cylinder", (0.36, 0.36, 0.7), 2, "#ff6a13", "cone", "rubber"),
    ),
    _piece(
        "jersey_barrier",
        "Jersey barrier",
        "walls",
        "street",
        "A fixed concrete road barrier 2 m long and 0.8 m tall.",
        _fixed("jersey_barrier", "Jersey barrier", "box", (2, 0.6, 0.8), "#cfcbc3", "barrier", "concrete"),
    ),
    _piece(
        "fence",
        "Fence",
        "walls",
        "street",
        "A wooden fence segment 3 m long and 1.2 m tall; line copies up for a longer fence.",
        _fixed("fence", "Fence", "box", (3, 0.08, 1.2), "#8b6a45", "fence", "wood"),
    ),
    _piece(
        "sign",
        "Sign",
        "target",
        "street",
        "A street sign 2.2 m tall: a plate on a pole, solid down to the ground.",
        _fixed("sign", "Sign", "box", (0.6, 0.08, 2.2), "#2f6fd6", "sign", "metal"),
    ),
    _piece(
        "lamp_post",
        "Lamp post",
        "sun",
        "street",
        "A street lamp 4.5 m tall with a glowing head; it lights nothing until a point light is added.",
        _fixed(
            "lamp_post", "Lamp post", "cylinder", (0.5, 0.5, 4.5), "#3a3f47", "lamp_post", "metal", look={"emissive": 1}
        ),
    ),
    _piece(
        "parked_car",
        "Parked car",
        "car",
        "street",
        "A parked car 4.2 m long that does not move: a fixed box drawn as a car with its wheels.",
        _fixed("parked_car", "Parked car", "box", (4.2, 1.8, 1.45), "#3b6fb6", "parked_car", "metal"),
    ),
    _piece(
        "puddle",
        "Puddle",
        "water",
        "street",
        "A wet patch 2 by 1.5 m and 2 cm high, as slippery as ice (friction 0.05).",
        _fixed("puddle", "Puddle", "box", (2, 1.5, 0.02), "#3d5566", "puddle", "ice", look={"reflectance": 0.6}),
    ),
    # Buildings
    _piece(
        "building",
        "Building",
        "walls",
        "buildings",
        "A city block building 10 by 10 m and 18 m tall with rows of lit windows.",
        _fixed("building", "Building", "box", (10, 10, 18), "#a8a29e", "building", "concrete", look={"emissive": 0.6}),
    ),
    _piece(
        "house",
        "Small house",
        "walls",
        "buildings",
        "A small brick house 7 by 6 m with a pitched roof, a door and windows, solid up to the ridge.",
        _fixed("house", "House", "box", (7, 6, 5.5), "#b5654a", "house", "concrete", look={"finish": "brick"}),
    ),
    _piece(
        "garage",
        "Garage",
        "car",
        "buildings",
        "A garage 4 by 6.5 m and 3 m tall with a roll-up door at its front (+x).",
        _fixed("garage", "Garage", "box", (4, 6.5, 3), "#c9c3b8", "garage", "concrete"),
    ),
    # Furniture
    _piece(
        "table",
        "Table",
        "grid",
        "furniture",
        "A 25 kg wooden table 1.6 m long and 0.75 m tall that can be pushed; nothing fits under it.",
        _movable("table", "Table", "box", (1.6, 0.9, 0.75), 25, "#8b5a2b", "table", "wood"),
    ),
    _piece(
        "bench",
        "Bench",
        "grid",
        "furniture",
        "A fixed park bench 1.8 m long with a backrest.",
        _fixed("bench", "Bench", "box", (1.8, 0.5, 0.85), "#7a5230", "bench", "wood"),
    ),
    _piece(
        "shelf",
        "Shelf",
        "grid",
        "furniture",
        "A fixed wooden shelf 1.2 m wide and 1.8 m tall with four boards.",
        _fixed("shelf", "Shelf", "box", (1.2, 0.4, 1.8), "#9a7b55", "shelf", "wood"),
    ),
    # Nature
    _piece(
        "tree",
        "Tree",
        "terrain",
        "nature",
        "A tree 5 m tall; its collider is the whole column around trunk and crown.",
        _fixed("tree", "Tree", "cylinder", (1.6, 1.6, 5), "#3f7d3a", "tree", "wood"),
    ),
    _piece(
        "bush",
        "Bush",
        "terrain",
        "nature",
        "A fixed bush 1.2 m across and 0.9 m tall.",
        _fixed("bush", "Bush", "box", (1.2, 1.2, 0.9), "#4a7d36", "bush", "grass"),
    ),
    _piece(
        "rock",
        "Rock",
        "terrain",
        "nature",
        "A fixed boulder 1.2 m across and 0.7 m tall.",
        _fixed("rock", "Rock", "box", (1.2, 1, 0.7), "#8a8580", "rock", "concrete"),
    ),
    # Props
    _piece(
        "crate_stack",
        "Crate stack",
        "box",
        "props",
        "Three crates stacked 1.2 m high that move together as one 60 kg block.",
        _movable("crate_stack", "Crate stack", "box", (1.2, 1.2, 1.2), 60, "#b08d57", "crate_stack", "wood"),
    ),
    _piece(
        "barrel",
        "Barrel",
        "box",
        "props",
        "A 30 kg steel barrel 0.9 m tall that can be pushed or knocked over.",
        _movable("barrel", "Barrel", "cylinder", (0.6, 0.6, 0.9), 30, "#2f6db3", "barrel", "metal"),
    ),
]

PIECES: dict[str, PieceInfo] = {piece.id: piece for piece in _PIECES}


def piece_summary(piece: PieceInfo) -> str:
    """One line for the copilot: what the piece is, its size, and whether it is fixed or how heavy it is."""
    view = {component.kind: component.properties for component in piece.object.components}
    size = getattr(view.get("mesh", {}).get("size"), "value", None)
    body = view.get("physics_body", {})
    mode = getattr(body.get("mode"), "value", "dynamic")
    mass = getattr(body.get("mass"), "value", None)
    sized = f" {size[0]:g}×{size[1]:g}×{size[2]:g} m (x, y, height)." if isinstance(size, tuple) else ""
    weight = " Fixed." if mode == "static" else f" Movable, {mass:g} kg." if mass is not None else ""
    return f"{piece.description}{sized}{weight}"


def pieces_by_category() -> dict[str, dict[str, str]]:
    """Category → piece id → its one-line summary, in library order."""
    grouped: dict[str, dict[str, str]] = {}
    for piece in _PIECES:
        grouped.setdefault(piece.category, {})[piece.id] = piece_summary(piece)
    return grouped
