"""Components that turn a body into a wheeled vehicle and let it sense its own motion and its target (see
design/vehicle.py and sim/vehicle.py)."""

from icarus.contracts.library import ComponentKindSpec
from icarus.contracts.scene import LIGHT_ROLES
from icarus.library.properties import choice, number, switch

STEERING_HINT = (
    "Ackermann turns the steering joints (vertical hinges with limits, such as front knuckles), the inner wheel more "
    "than the outer; Differential turns by driving the left and right wheels at different speeds, for tracked and "
    "skid-steer bodies"
)
DRIVE_HINT = (
    "Which wheels the throttle drives: front or rear of the wheels' middle, or all. Wheels are the body's hinges "
    "with no limits; motors on the wheels and steering joints the vehicle uses are replaced by its own"
)
MAX_SPEED_HINT = "The throttle stops pushing past this speed, forward or in reverse"
BRAKE_HINT = "How hard the brake holds every wheel at full brake: the turning resistance per rad/s of wheel spin"
LIGHT_HINT = (
    "Brake glows while braking or slowing down hard, reverse while backing, head while the vehicle drives; the "
    "engine decides from the vehicle's commands and motion"
)

VEHICLE_KINDS = [
    ComponentKindSpec(
        kind="vehicle",
        label="Vehicle",
        icon="car",
        group="Physics",
        unique=True,
        properties=[
            choice("steering", "Steering", ["ackermann", "differential"], "ackermann", hint=STEERING_HINT),
            choice("drive", "Drive wheels", ["rear", "front", "all"], "rear", hint=DRIVE_HINT),
            switch("reverse", "Reverse", True, hint="Off: the throttle only drives forward"),
            number(
                "max_torque", "Max torque", "N·m", 1, 10_000, 400, hint="Torque on each drive wheel at full throttle"
            ),
            number("max_steer", "Max steering angle", "°", 1, 60, 35, hint="The inner wheel's angle at full lock"),
            number("max_speed", "Speed limit", "m/s", 0.1, 100, 5, hint=MAX_SPEED_HINT),
            number("brake", "Brake strength", "N·m·s/rad", 0, 10_000, 300, hint=BRAKE_HINT),
            number("steer_force", "Steering strength", "N·m", 1, 10_000, 2000, expert=True),
        ],
    ),
    ComponentKindSpec(
        kind="speed",
        label="Speed",
        icon="physics",
        group="Senses",
        unique=True,
        properties=[
            number("scale", "Full scale", "m/s", 0.5, 100, 10, hint="The speed the brain reads as 1"),
        ],
    ),
    ComponentKindSpec(
        kind="target",
        label="Target",
        icon="target",
        group="Senses",
        unique=True,
        properties=[
            number(
                "range",
                "Full scale",
                "m",
                1,
                500,
                10,
                hint="The distance to the goal zone the brain reads as 1; reads nothing without a goal zone",
            ),
        ],
    ),
    ComponentKindSpec(
        kind="vehicle_light",
        label="Vehicle light",
        icon="sun",
        group="Shape",
        unique=True,
        properties=[choice("role", "Role", LIGHT_ROLES, "brake", hint=LIGHT_HINT)],
    ),
]
