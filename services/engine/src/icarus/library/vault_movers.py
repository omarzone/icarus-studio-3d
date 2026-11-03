"""Body vault members that do not step: a segmented snake that moves by waves, a wheeled rover and a one-legged
hopper. Like the legged ones, each holds still at rest with its motors at zero."""

from icarus.library.parts import Part, Raw, hinge, motor, solid
from icarus.library.vault_legs import FOOT, JOINT

SEGMENTS = 8
SEGMENT = (0.11, 0.08, 0.06)
GAP = 0.02


def snake(color: str) -> list[Part]:
    """Eight segments in a row, joined by hinges that turn sideways and up and down in turn, so the brain can
    learn a sideways wave, an inchworm wave or both."""
    length, width, height = SEGMENT
    spacing = length + GAP
    head = solid(
        "head",
        "Head",
        None,
        (0, 0, height / 2),
        "box",
        (length, width, height),
        0.3,
        color,
        extra={
            "eyes": {"size": 0.03, "spacing": 0.045, "height": 0.02, "look": "movement"},
            "material": {"color": color, "style": "shell", "bevel": 0.025},
            "speed": {"scale": 1},
        },
    )
    parts = [head]
    parent = head.id
    for index in range(1, SEGMENTS):
        # Sideways turns on odd joints, up and down on even ones.
        axis: tuple[float, float, float] = (0, 0, 1) if index % 2 else (0, 1, 0)
        limits = (-40.0, 40.0) if index % 2 else (-30.0, 30.0)
        segment = solid(
            f"segment_{index}",
            f"Segment {index}",
            parent,
            (-spacing, 0, 0),
            "box",
            (length, width, height),
            0.25,
            color if index % 2 == 0 else JOINT,
            extra={
                "joint": hinge(axis, limits, (spacing / 2, 0, 0)),
                "motor": motor("position", 3),
                "material": {"color": color if index % 2 == 0 else JOINT, "style": "shell", "bevel": 0.025},
            },
        )
        parts.append(segment)
        parent = segment.id
    return parts


def _wheel(id: str, name: str, position: tuple[float, float, float]) -> Part:
    # Turned so the wheel's axis points left and a positive spin rolls the rover forward.
    return solid(
        id,
        name,
        "chassis",
        position,
        "cylinder",
        (0.16, 0.16, 0.06),
        0.4,
        FOOT,
        rotation=(-90, 0, 0),
        extra={"joint": hinge((0, 0, 1), (-180, 180)), "collider": {"friction": 1.2}},
        style="wheel",
    )


def rover(color: str) -> list[Part]:
    """A small four-wheeled rover that turns by driving its left and right wheels at different speeds; its brain
    drives it with throttle, brake and steering."""
    vehicle: dict[str, Raw] = {
        "steering": "differential",
        "drive": "all",
        "max_torque": 3,
        "max_speed": 2,
        "brake": 2,
    }
    wheel_drop = 0.04
    chassis = solid(
        "chassis",
        "Chassis",
        None,
        (0, 0, 0.08 + wheel_drop),
        "box",
        (0.5, 0.3, 0.12),
        6.0,
        color,
        extra={
            "balance": {},
            "speed": {"scale": 2},
            "distance_ray": {"name": "Ahead", "range": 4, "count": 5},
            "vehicle": vehicle,
            "eyes": {"size": 0.05, "spacing": 0.12, "height": 0.02, "look": "movement"},
            "material": {"color": color, "style": "shell", "bevel": 0.03},
        },
    )
    parts = [chassis]
    for end, x in (("front", 0.17), ("rear", -0.17)):
        for side, y in (("left", 0.19), ("right", -0.19)):
            parts.append(_wheel(f"wheel_{end}_{side}", f"{end.capitalize()} {side} wheel", (x, y, -wheel_drop)))
    return parts


def hopper(color: str) -> list[Part]:
    """A body on one strong leg with a wide flat foot: it stands on its own and moves by learning to hop."""
    torso_height = 0.24
    leg = 0.28
    foot_height = 0.04
    # The foot overlaps the shin by 2 cm.
    stance = torso_height / 2 + 2 * leg + foot_height - 0.02
    torso = solid(
        "torso",
        "Torso",
        None,
        (0, 0, stance),
        "capsule",
        (0.2, 0.2, torso_height),
        4.0,
        color,
        extra={"balance": {}, "eyes": {"size": 0.05, "spacing": 0.08, "height": 0.04, "look": "movement"}},
        style="shell",
    )
    thigh = solid(
        "thigh",
        "Thigh",
        torso.id,
        (0, 0, -torso_height / 2 - leg / 2),
        "capsule",
        (0.07, 0.07, leg),
        1.2,
        JOINT,
        extra={"joint": hinge((0, 1, 0), (-60, 60), (0, 0, leg / 2)), "motor": motor("position", 120)},
        style="joint",
    )
    shin = solid(
        "shin",
        "Shin",
        thigh.id,
        (0, 0, -leg),
        "capsule",
        (0.06, 0.06, leg),
        0.8,
        JOINT,
        extra={"joint": hinge((0, 1, 0), (0, 120), (0, 0, leg / 2)), "motor": motor("position", 120)},
        style="joint",
    )
    foot = solid(
        "foot",
        "Foot",
        shin.id,
        (0.03, 0, -leg / 2 - foot_height / 2 + 0.02),
        "box",
        (0.3, 0.2, foot_height),
        0.6,
        FOOT,
        extra={
            "joint": hinge((0, 1, 0), (-40, 40), (-0.03, 0, foot_height / 2)),
            "motor": motor("position", 60),
            "touch": {"radius": 0.12},
            "collider": {"friction": 1.2},
        },
        style="shell",
    )
    return [torso, thigh, shin, foot]
