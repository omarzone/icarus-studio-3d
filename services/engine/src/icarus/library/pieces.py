from icarus.contracts.library import PieceInfo
from icarus.library.parts import Part, decoration, fixture, solid


def _static(part: Part) -> Part:
    part.components["physics_body"] = {"mode": "static"}
    return part


def _piece(id: str, label: str, icon: str, description: str, part: Part) -> PieceInfo:
    return PieceInfo(id=id, label=label, icon=icon, description=description, object=part.spec())


_PIECES = [
    _piece(
        "box",
        "Box obstacle",
        "box",
        "A movable crate to push or avoid.",
        solid("box", "Box", None, (3, 0, 0.25), "box", (0.5, 0.5, 0.5), 5, "#b08d57", style="crate"),
    ),
    _piece(
        "ramp",
        "Ramp",
        "terrain",
        "A fixed slope to climb.",
        _static(solid("ramp", "Ramp", None, (3, 0, 0.25), "box", (2, 1.5, 0.1), 1, "#6b7280", rotation=(0, -15, 0))),
    ),
    _piece(
        "wall",
        "Wall",
        "walls",
        "A fixed wall that blocks the way.",
        _static(solid("wall", "Wall", None, (3, 0, 0.5), "box", (0.2, 3, 1), 1, "#9ca3af", style="wall")),
    ),
    _piece(
        "post",
        "Post",
        "target",
        "A fixed post to steer around.",
        _static(solid("post", "Post", None, (3, 0, 0.5), "cylinder", (0.2, 0.2, 1), 1, "#f0a63a", style="post")),
    ),
    _piece(
        "ball",
        "Ball",
        "goal",
        "A light ball that rolls.",
        solid("ball", "Ball", None, (3, 0, 0.15), "sphere", (0.3, 0.3, 0.3), 0.5, "#d9534f", style="ball"),
    ),
    # Scenery: frames a believable place around the task. Looks-only pieces have no collider, so nothing touches them.
    _piece(
        "building",
        "Building",
        "walls",
        "A tall fixed block for the edges of a street or lot; it frames the scene and blocks whatever runs into it.",
        fixture("building", "Building", None, (0, 15, 5), "box", (12, 8, 10), "#b9ad9c", style="wall"),
    ),
    _piece(
        "curb",
        "Curb",
        "walls",
        "A low fixed edge between the road and the sidewalk; wheels bump into it.",
        fixture("curb", "Curb", None, (0, 4, 0.075), "box", (10, 0.25, 0.15), "#bfc3c7", style="curb"),
    ),
    _piece(
        "sidewalk",
        "Sidewalk",
        "terrain",
        "A slightly raised fixed slab beside a road, for the edges of a street scene.",
        fixture("sidewalk", "Sidewalk", None, (0, 5.5, 0.06), "box", (10, 2.8, 0.12), "#cfcac2"),
    ),
    _piece(
        "lamp_post",
        "Lamp post",
        "sun",
        "A street lamp drawn on the world without a collider: decoration for the edges, never on the path.",
        decoration(
            "lamp_post", "Lamp post", None, (0, 6.5, 2.25), "cylinder", (0.3, 0.3, 4.5), "#3f4448", style="lamp_post"
        ),
    ),
    _piece(
        "tree",
        "Tree",
        "terrain",
        "A tree drawn on the world without a collider: decoration for the edges, never on the path.",
        decoration("tree", "Tree", None, (0, 8, 2), "cylinder", (2, 2, 4), "#4f7a3a", style="tree"),
    ),
    _piece(
        "cone",
        "Traffic cone",
        "target",
        "A small fixed cone that marks a hazard or a lane; rays see it and the body bumps into it.",
        fixture("cone", "Traffic cone", None, (3, 1, 0.35), "cylinder", (0.4, 0.4, 0.7), "#f07a2a", style="cone"),
    ),
    _piece(
        "sign",
        "Sign",
        "box",
        "A thin sign board standing on the ground, without a collider: decoration beside the path.",
        decoration("sign", "Sign", None, (0, 6.5, 1.1), "box", (0.08, 0.8, 2.2), "#2f6db3"),
    ),
]

PIECES: dict[str, PieceInfo] = {piece.id: piece for piece in _PIECES}
