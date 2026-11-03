"""Ready-made floor plates and wall displays: places a body steps on and counters the engine fills per frame."""

from icarus.contracts.library import PieceCategory, PieceInfo
from icarus.library.parts import Part, Raw


def _piece(id: str, label: str, icon: str, category: PieceCategory, description: str, part: Part) -> PieceInfo:
    return PieceInfo(id=id, label=label, icon=icon, category=category, description=description, object=part.spec())


def _plate(id: str, name: str, color: str, plate: dict[str, Raw]) -> Part:
    """A plate lying on the ground 3 m ahead; it has no collider of its own beyond the plate."""
    return Part(
        id,
        name,
        None,
        {
            "transform": {"position": (3, 0, 0)},
            "material": {"color": color},
            "plate": {"color": color} | plate,
        },
    )


def _panel(id: str, name: str, size: tuple[float, float, float], z: float, display: dict[str, Raw]) -> Part:
    """A dark look-only panel standing 3 m ahead with a display on its face toward the start; nothing touches it."""
    return Part(
        id,
        name,
        None,
        {
            "transform": {"position": (3, 0, z), "rotation": (0, 0, 180)},
            "mesh": {"shape": "box", "size": size},
            "material": {"color": "#1b1d22", "finish": "painted_metal"},
            "display": {"offset": (size[0] / 2 + 0.01, 0, 0), "width": size[1] * 0.9} | display,
        },
    )


PLATE_PIECES = [
    _piece(
        "pressure_plate",
        "Pressure plate",
        "target",
        "basics",
        "A 1 m square plate 3 cm thick that sinks and lights up while the body pushes on it with at least 20 N.",
        _plate(
            "pressure_plate",
            "Pressure plate",
            "#f0a63a",
            {"role": "pressure", "size": (1, 1, 0.03), "press_force": 20},
        ),
    ),
    _piece(
        "target_plate",
        "Target plate",
        "goal",
        "basics",
        "A green 1.2 m goal plate 2 cm thick that lights up when the body steps on it; several can be goals in order.",
        _plate("target_plate", "Target plate", "#34c759", {"role": "target"}),
    ),
    _piece(
        "start_pad",
        "Start pad",
        "spawn",
        "basics",
        "A striped 2 m start pad 1 cm thick to place the spawn point on; never a goal.",
        _plate("start_pad", "Start pad", "#f2c94c", {"role": "start", "size": (2, 2, 0.01), "trigger": "center"}),
    ),
    _piece(
        "step_zone",
        "Step zone",
        "zone",
        "basics",
        "A round 1.5 m custom plate 1 cm thick that lights while the body's center is over it.",
        _plate(
            "step_zone",
            "Step zone",
            "#5ac8fa",
            {"role": "custom", "shape": "circle", "size": (1.5, 1.5, 0.01), "trigger": "center"},
        ),
    ),
    _piece(
        "time_counter",
        "Time counter",
        "lines",
        "props",
        "A wall panel 2 m wide, 2 m up, whose red digits show the try's time as mm:ss; drawing only.",
        _panel("time_counter", "Time counter", (0.1, 2, 0.8), 2, {"label": "TIME"}),
    ),
    _piece(
        "generation_counter",
        "Generation counter",
        "lines",
        "props",
        "A wall panel 2 m wide, 2 m up, showing the brain's training steps: live, replayed or in Play; drawing only.",
        _panel(
            "generation_counter",
            "Generation counter",
            (0.1, 2, 0.8),
            2,
            {"label": "GEN", "source": "training_steps", "format": "integer"},
        ),
    ),
]
