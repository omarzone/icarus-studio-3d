"""Wheeled bodies built on the vehicle component: a car that parks in a painted bay and a two-wheeled motorcycle."""

from icarus.library.parts import Part, Raw, decoration, hinge, solid

# Painted lines a few millimetres proud of the ground.
PAINT = 0.01
# The parking spot: where it is, and a bay wide enough for the car with its wheels at full lock and some room.
SPOT = (12.0, 0.0)
SPOT_LENGTH = 5.0
SPOT_WIDTH = 3.2
TIRE = "#1f2023"


def _wheel(id: str, name: str, parent: str, position: tuple[float, float, float], size: tuple[float, float, float]):
    # Turned so the wheel axis points left and a positive spin rolls the body forward.
    return solid(
        id,
        name,
        parent,
        position,
        "cylinder",
        size,
        20,
        TIRE,
        rotation=(-90, 0, 0),
        extra={"joint": hinge((0, 0, 1), (-180, 180)), "collider": {"friction": 1.2}},
        style="wheel",
    )


def _lights(parent: str, half_length: float, height: float) -> list[Part]:
    """Head lights in front and brake and reverse lights behind, just proud of the body; drawing only."""
    lamps: list[tuple[str, str, str, float, float, float, str]] = [
        ("head", "Head light", "head", half_length, 0.65, 0.3, "#fff4cc"),
        ("brake", "Brake light", "brake", -half_length, 0.65, 0.3, "#d0302a"),
        ("reverse", "Reverse light", "reverse", -half_length, 0.3, 0.14, "#f2f2f2"),
    ]
    parts: list[Part] = []
    for key, label, role, x, y, width, color in lamps:
        for side, sign in (("left", 1), ("right", -1)):
            lamp = decoration(
                f"{key}_light_{side}",
                f"{label} {side}",
                parent,
                (x + (0.02 if x > 0 else -0.02), sign * y, height),
                "box",
                (0.04, width, 0.12),
                color,
            )
            lamp.components["vehicle_light"] = {"role": role}
            parts.append(lamp)
    return parts


def parking_car() -> list[Part]:
    """A car with front Ackermann steering and rear drive, rays all around, speed and target senses, and a
    rectangular spot it must end wholly inside, lined up either way and stopped."""
    vehicle: dict[str, Raw] = {"drive": "rear", "max_torque": 400, "max_steer": 35, "max_speed": 3, "brake": 100}
    car = solid(
        "car",
        "Car",
        None,
        (0, 0, 0.5),
        "box",
        (4, 1.8, 0.6),
        900,
        "#c8553d",
        extra={
            "distance_ray": {"name": "Around", "range": 10, "count": 16, "spread": 360},
            "speed": {},
            "target": {},
            "vehicle": vehicle,
        },
        style="car_body",
    )
    parts = [car, *_lights("car", 2.0, 0.1)]
    # Wide enough that a front wheel at full lock clears the body.
    for side, y in (("left", 1.2), ("right", -1.2)):
        knuckle = f"steer_{side}"
        parts.append(
            solid(
                knuckle,
                f"Front {side} steering",
                "car",
                (1.3, y, -0.2),
                "sphere",
                (0.12, 0.12, 0.12),
                4,
                "#2b2d31",
                extra={"joint": hinge((0, 0, 1), (-35, 35))},
                style="joint",
            )
        )
        parts.append(_wheel(f"wheel_front_{side}", f"Front {side} wheel", knuckle, (0, 0, 0), (0.6, 0.6, 0.25)))
        parts.append(_wheel(f"wheel_rear_{side}", f"Rear {side} wheel", "car", (-1.3, y, -0.2), (0.6, 0.6, 0.25)))
    goal: dict[str, Raw] = {
        "shape": "rectangle",
        "length": SPOT_LENGTH,
        "width": SPOT_WIDTH,
        "fully_inside": True,
        "align_within": 15,
        "entry": "either",
    }
    parts.append(Part("goal", "Parking spot", None, {"transform": {"position": (*SPOT, 0)}, "goal_zone": goal}))
    return parts


def lot_markings() -> list[Part]:
    """Painted bays around the parking spot, one bay wide each: lines only, nothing the car can touch or see."""
    white = "#e8eaed"
    x, y = SPOT
    edges = [y + SPOT_WIDTH * (index + 0.5) for index in range(-3, 3)]
    parts = [
        decoration(
            f"bay_line_{index}",
            f"Bay line {index + 1}",
            None,
            (x, edge, PAINT / 2),
            "box",
            (SPOT_LENGTH, 0.12, PAINT),
            white,
            style="marking",
        )
        for index, edge in enumerate(edges)
    ]
    parts.append(
        decoration(
            "bay_end_line",
            "Bay end line",
            None,
            (x + SPOT_LENGTH / 2, y, PAINT / 2),
            "box",
            (0.12, edges[-1] - edges[0] + 0.12, PAINT),
            white,
            style="marking",
        )
    )
    return parts


def motorcycle() -> list[Part]:
    """Two wheels in line: a steered front fork and a driven rear wheel. It cannot stand still on its own; its
    brain has to learn to balance by steering into the lean at speed, as a rider does."""
    vehicle: dict[str, Raw] = {"drive": "rear", "max_torque": 60, "max_steer": 30, "max_speed": 6, "brake": 10}
    frame = solid(
        "frame",
        "Frame",
        None,
        (0, 0, 0.55),
        "box",
        (1.4, 0.24, 0.3),
        120,
        "#2f6fb0",
        extra={
            "distance_ray": {"name": "Ahead", "range": 10, "count": 5},
            "speed": {},
            "target": {},
            "balance": {},
            "vehicle": vehicle,
        },
        style="shell",
    )
    fork = solid(
        "fork",
        "Front fork",
        "frame",
        # Far enough ahead that the front wheel clears the frame when it turns.
        (1.05, 0, -0.1),
        "capsule",
        (0.08, 0.08, 0.3),
        4,
        "#8b9098",
        extra={"joint": hinge((0, 0, 1), (-30, 30))},
        style="joint",
    )
    return [
        frame,
        fork,
        _wheel("wheel_front", "Front wheel", "fork", (0, 0, -0.12), (0.62, 0.62, 0.12)),
        _wheel("wheel_rear", "Rear wheel", "frame", (-0.65, 0, -0.22), (0.62, 0.62, 0.14)),
        Part("goal", "Finish", None, {"transform": {"position": (15, 0, 0)}, "goal_zone": {"radius": 1.5}}),
    ]
