from icarus.contracts.library import PieceInfo
from icarus.library.templates import Part, solid


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
        solid("box", "Box", None, (3, 0, 0.25), "box", (0.5, 0.5, 0.5), 5, "#b08d57"),
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
        _static(solid("wall", "Wall", None, (3, 0, 0.5), "box", (0.2, 3, 1), 1, "#9ca3af")),
    ),
    _piece(
        "post",
        "Post",
        "target",
        "A fixed post to steer around.",
        _static(solid("post", "Post", None, (3, 0, 0.5), "cylinder", (0.2, 0.2, 1), 1, "#f0a63a")),
    ),
    _piece(
        "ball",
        "Ball",
        "goal",
        "A light ball that rolls.",
        solid("ball", "Ball", None, (3, 0, 0.15), "sphere", (0.3, 0.3, 0.3), 0.5, "#d9534f"),
    ),
]

PIECES: dict[str, PieceInfo] = {piece.id: piece for piece in _PIECES}
