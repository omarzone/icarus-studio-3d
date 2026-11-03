"""Legged bodies of the body vault: a dog, an eight-legged spider, a six-legged hexapod, a three-legged tripod and a
ball-bodied crawler. Every joint stands straight at zero, so position motors at rest hold the body up."""

import math
from dataclasses import dataclass

from icarus.library.parts import Part, Raw, hinge, motor, solid

JOINT = "#8b9098"
FOOT = "#2b2d31"


@dataclass(frozen=True)
class SpreadLeg:
    """A leg that points out from the body: a hip that swings it forward and back, a level upper leg that lifts it,
    a lower leg that hangs straight down (with a knee when `knee_force` is set) and a foot that feels the ground."""

    upper: float
    lower: float
    width: float
    hip_mass: float
    upper_mass: float
    lower_mass: float
    swing: float
    lift: float
    swing_force: float
    lift_force: float
    knee_force: float = 0
    foot: float = 0.03

    @property
    def stance(self) -> float:
        """How far below the hip the ground is when every joint is at zero."""
        return self.lower + self.foot / 2


def spread_leg(name: str, label: str, parent: str, at: tuple[float, float, float], yaw: float, leg: SpreadLeg):
    hip_size = leg.width * 1.6
    hip = solid(
        f"{name}_hip",
        f"{label} hip",
        parent,
        at,
        "sphere",
        (hip_size, hip_size, hip_size),
        leg.hip_mass,
        JOINT,
        rotation=(0, 0, yaw),
        extra={"joint": hinge((0, 0, 1), (-leg.swing, leg.swing)), "motor": motor("position", leg.swing_force)},
        style="joint",
    )
    # Turned so the capsule runs out from the hip; its frame's z points away from the body.
    upper = solid(
        f"{name}_upper",
        f"{label} upper leg",
        hip.id,
        (leg.upper / 2, 0, 0),
        "capsule",
        (leg.width, leg.width, leg.upper),
        leg.upper_mass,
        JOINT,
        rotation=(0, 90, 0),
        extra={
            "joint": hinge((0, 1, 0), (-leg.lift, leg.lift), (0, 0, -leg.upper / 2)),
            "motor": motor("position", leg.lift_force),
        },
        style="joint",
    )
    lower_extra: dict[str, dict[str, Raw]] = {}
    if leg.knee_force:
        lower_extra = {
            "joint": hinge((0, 1, 0), (-45, 45), (0, 0, leg.lower / 2)),
            "motor": motor("position", leg.knee_force),
        }
    # Turned back upright, so it hangs straight down from the upper leg's outer end.
    lower = solid(
        f"{name}_lower",
        f"{label} lower leg",
        upper.id,
        (leg.lower / 2, 0, leg.upper / 2),
        "capsule",
        (leg.width * 0.85, leg.width * 0.85, leg.lower),
        leg.lower_mass,
        JOINT,
        rotation=(0, -90, 0),
        extra=lower_extra,
        style="joint",
    )
    foot = solid(
        f"{name}_foot",
        f"{label} foot",
        lower.id,
        (0, 0, -leg.lower / 2),
        "sphere",
        (leg.foot, leg.foot, leg.foot),
        leg.lower_mass * 0.2,
        FOOT,
        extra={"touch": {"radius": leg.foot * 0.75}, "collider": {"friction": 1.2}},
        style="shell",
    )
    return [hip, upper, lower, foot]


def _ring(parent: str, radius: float, height: float, yaws: list[tuple[str, str, float]], leg: SpreadLeg) -> list[Part]:
    """Legs around a round body, each hip just outside its surface."""
    reach = radius + leg.width * 0.8
    parts: list[Part] = []
    for name, label, yaw in yaws:
        turn = math.radians(yaw)
        at = (round(reach * math.cos(turn), 4), round(reach * math.sin(turn), 4), height)
        parts += spread_leg(name, label, parent, at, yaw, leg)
    return parts


def _eyes(size: float, spacing: float, height: float) -> dict[str, Raw]:
    return {"size": size, "spacing": spacing, "height": height, "look": "movement"}


SPIDER_LEG = SpreadLeg(0.14, 0.12, 0.02, 0.02, 0.04, 0.04, 30, 40, 2, 5, foot=0.024)


def spider(color: str) -> list[Part]:
    """A round head with eyes and a big round abdomen behind it, on eight legs that each swing and lift."""
    head = 0.16
    stance = SPIDER_LEG.stance
    body = solid(
        "cephalothorax",
        "Head",
        None,
        (0, 0, stance),
        "sphere",
        (head, head, head),
        0.6,
        color,
        extra={"balance": {}, "eyes": _eyes(0.035, 0.05, 0.03)},
        style="shell",
    )
    abdomen = solid("abdomen", "Abdomen", body.id, (-0.21, 0, 0.03), "sphere", (0.2, 0.2, 0.2), 0.6, color)
    abdomen.components["material"]["style"] = "shell"
    yaws: list[tuple[str, str, float]] = []
    for index, angle in enumerate((40, 75, 105, 140), start=1):
        yaws += [(f"leg_l{index}", f"Left leg {index}", angle), (f"leg_r{index}", f"Right leg {index}", -angle)]
    return [body, abdomen, *_ring(body.id, head / 2, 0, yaws, SPIDER_LEG)]


HEXAPOD_LEG = SpreadLeg(0.1, 0.13, 0.025, 0.05, 0.08, 0.07, 30, 40, 4, 8, knee_force=6)


def hexapod(color: str) -> list[Part]:
    """A flat box body on six legs in two rows of three, each with a hip, a lifting upper leg and a knee."""
    length, width, height = 0.36, 0.2, 0.06
    body = solid(
        "chassis",
        "Body",
        None,
        (0, 0, HEXAPOD_LEG.stance),
        "box",
        (length, width, height),
        2.0,
        color,
        extra={
            "balance": {},
            "eyes": _eyes(0.04, 0.08, 0.01),
            "material": {"color": color, "style": "shell", "bevel": 0.02},
        },
    )
    side = width / 2 + HEXAPOD_LEG.width * 0.8
    parts = [body]
    for row, (x, yaw) in enumerate(((0.13, 45), (0.0, 90), (-0.13, 135)), start=1):
        parts += spread_leg(f"leg_l{row}", f"Left leg {row}", body.id, (x, side, 0), yaw, HEXAPOD_LEG)
        parts += spread_leg(f"leg_r{row}", f"Right leg {row}", body.id, (x, -side, 0), -yaw, HEXAPOD_LEG)
    return parts


TRIPOD_LEG = SpreadLeg(0.12, 0.16, 0.03, 0.05, 0.1, 0.1, 35, 40, 4, 9, foot=0.035)


def tripod(color: str) -> list[Part]:
    """A round disc on three legs set a third of a turn apart, one pointing forward."""
    disc = 0.28
    body = solid(
        "disc",
        "Body",
        None,
        (0, 0, TRIPOD_LEG.stance),
        "cylinder",
        (disc, disc, 0.08),
        1.5,
        color,
        extra={"balance": {}, "eyes": _eyes(0.05, 0.08, 0.06)},
        style="shell",
    )
    yaws = [("leg_front", "Front leg", 0.0), ("leg_left", "Left leg", 120.0), ("leg_right", "Right leg", -120.0)]
    return [body, *_ring(body.id, disc / 2, 0, yaws, TRIPOD_LEG)]


CRAWLER_LEG = SpreadLeg(0.1, 0.17, 0.03, 0.04, 0.08, 0.08, 35, 40, 4, 10, foot=0.035)


def ball_crawler(color: str) -> list[Part]:
    """A ball on four stubby legs set at its corners, crawling like a little beetle."""
    ball = 0.26
    body = solid(
        "ball",
        "Body",
        None,
        (0, 0, CRAWLER_LEG.stance),
        "sphere",
        (ball, ball, ball),
        2.0,
        color,
        extra={"balance": {}, "eyes": _eyes(0.06, 0.09, 0.05)},
        style="shell",
    )
    yaws = [
        ("leg_fl", "Front left leg", 45.0),
        ("leg_fr", "Front right leg", -45.0),
        ("leg_bl", "Back left leg", 135.0),
        ("leg_br", "Back right leg", -135.0),
    ]
    return [body, *_ring(body.id, ball / 2, 0, yaws, CRAWLER_LEG)]


def _dog_leg(name: str, label: str, at: tuple[float, float, float], knee: tuple[float, float]) -> list[Part]:
    hip = solid(
        f"{name}_hip",
        f"{label} hip",
        "torso",
        at,
        "sphere",
        (0.08, 0.08, 0.08),
        0.3,
        JOINT,
        extra={"joint": hinge((1, 0, 0), (-20, 20)), "motor": motor("position", 60)},
        style="joint",
    )
    thigh = solid(
        f"{name}_thigh",
        f"{label} thigh",
        hip.id,
        (0, 0, -0.12),
        "capsule",
        (0.06, 0.06, 0.24),
        1.0,
        JOINT,
        extra={"joint": hinge((0, 1, 0), (-60, 60), (0, 0, 0.12)), "motor": motor("position", 80)},
        style="joint",
    )
    shin = solid(
        f"{name}_shin",
        f"{label} shin",
        thigh.id,
        (0, 0, -0.24),
        "capsule",
        (0.05, 0.05, 0.24),
        0.6,
        JOINT,
        extra={"joint": hinge((0, 1, 0), knee, (0, 0, 0.12)), "motor": motor("position", 80)},
        style="joint",
    )
    paw = solid(
        f"{name}_paw",
        f"{label} paw",
        shin.id,
        (0, 0, -0.12),
        "sphere",
        (0.06, 0.06, 0.06),
        0.1,
        FOOT,
        extra={"touch": {"radius": 0.045}, "collider": {"friction": 1.2}},
        style="shell",
    )
    return [hip, thigh, shin, paw]


def dog(color: str) -> list[Part]:
    """A four-legged dog the size of a Labrador: a torso, a head with eyes, and legs with a hip that spreads, a
    thigh and a knee, front knees bending back and hind knees forward."""
    stance = 0.48 + 0.03
    torso = solid(
        "torso",
        "Torso",
        None,
        (0, 0, stance),
        "box",
        (0.6, 0.26, 0.14),
        9.0,
        color,
        extra={"balance": {}, "material": {"color": color, "style": "shell", "bevel": 0.04}},
    )
    head = solid(
        "head",
        "Head",
        torso.id,
        (0.36, 0, 0.1),
        "sphere",
        (0.17, 0.17, 0.17),
        1.0,
        color,
        extra={"eyes": _eyes(0.04, 0.07, 0.03)},
        style="shell",
    )
    side = 0.13 + 0.04
    parts = [torso, head]
    for name, label, x, knee in (
        ("front", "Front", 0.22, (-10.0, 110.0)),
        ("hind", "Hind", -0.22, (-110.0, 10.0)),
    ):
        parts += _dog_leg(f"{name}_left", f"{label} left", (x, side, 0), knee)
        parts += _dog_leg(f"{name}_right", f"{label} right", (x, -side, 0), knee)
    return parts
