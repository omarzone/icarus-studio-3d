"""Hardware a body can be built with: classes of real servos, motors and sensors with their rated limits, and kits.

Ratings are typical datasheet values for each class at its usual supply voltage; prices are approximate street prices
in US dollars. A class names a family of interchangeable parts ("MG996R class"), never one shop's listing.
"""

import math
from dataclasses import dataclass
from typing import Literal

# What a body's actuator does on the device, read from how the design drives it.
ActuatorRole = Literal["drive", "steering", "joint", "linear"]
SensorRole = Literal["distance", "balance", "touch"]
Motion = Literal["rotary", "linear"]


@dataclass(frozen=True)
class ActuatorClass:
    id: str
    name: str
    motion: Motion
    # Stall torque (N·m) for rotary parts, peak force (N) for linear ones.
    effort: float
    # No-load speed: rad/s for rotary parts, m/s for linear ones.
    speed: float
    # Travel in degrees for rotary parts or metres for linear ones; None turns without end.
    travel: float | None
    usd: float


@dataclass(frozen=True)
class SensorClass:
    id: str
    name: str
    role: SensorRole
    # Furthest reliable reading in metres, for distance sensors.
    range_m: float | None
    usd: float


@dataclass(frozen=True)
class ActuatorSlot:
    role: ActuatorRole
    part: str
    count: int
    # One part drives every joint of this role, through a differential or a steering linkage.
    shared: bool = False


@dataclass(frozen=True)
class SensorSlot:
    role: SensorRole
    part: str
    count: int


@dataclass(frozen=True)
class KitExtra:
    name: str
    usd: float
    count: int = 1


@dataclass(frozen=True)
class HardwareKit:
    id: str
    name: str
    board: str
    actuators: tuple[ActuatorSlot, ...]
    sensors: tuple[SensorSlot, ...]
    extras: tuple[KitExtra, ...]


def _rpm(value: float) -> float:
    return value * 2 * math.pi / 60


def _per_60deg(seconds: float) -> float:
    return (math.pi / 3) / seconds


ACTUATORS: dict[str, ActuatorClass] = {
    part.id: part
    for part in (
        ActuatorClass("micro_servo", "Micro servo 9 g (SG90 class)", "rotary", 0.18, _per_60deg(0.1), 180, 3),
        ActuatorClass("standard_servo", "Metal-gear servo (MG996R class)", "rotary", 1.0, _per_60deg(0.17), 180, 10),
        ActuatorClass("smart_servo", "Smart serial servo (XL430 class)", "rotary", 1.5, _rpm(61), 360, 50),
        ActuatorClass("qdd_actuator", "Quasi-direct-drive actuator (mini-cheetah class)", "rotary", 17, 40, None, 300),
        ActuatorClass("tt_motor", "TT gear motor 1:48 (hobby class)", "rotary", 0.08, _rpm(200), None, 3),
        ActuatorClass("rc_drive", "540 brushed motor, 1:12 transmission (1:10 RC class)", "rotary", 1.9, 130, None, 35),
        ActuatorClass("linear_servo", "Micro linear servo, 30 mm stroke", "linear", 40, 0.02, 0.03, 70),
    )
}

SENSORS: dict[str, SensorClass] = {
    part.id: part
    for part in (
        SensorClass("tof_distance", "Time-of-flight distance sensor (VL53L1X class)", "distance", 4.0, 12),
        SensorClass("ultrasonic", "Ultrasonic distance sensor (HC-SR04 class)", "distance", 4.0, 2),
        SensorClass("imu", "6-axis IMU (MPU-6050 class)", "balance", None, 4),
        SensorClass("foot_switch", "Micro switch contact sensor", "touch", None, 1),
    )
}

KITS: dict[str, HardwareKit] = {
    kit.id: kit
    for kit in (
        HardwareKit(
            "rc_car",
            "1:10 RC car with a Raspberry Pi",
            "Raspberry Pi 5",
            (ActuatorSlot("drive", "rc_drive", 1, shared=True), ActuatorSlot("steering", "standard_servo", 1, True)),
            (SensorSlot("distance", "tof_distance", 8), SensorSlot("balance", "imu", 1)),
            (KitExtra("1:10 RC chassis", 120), KitExtra("Raspberry Pi 5", 60), KitExtra("2S LiPo battery", 25)),
        ),
        HardwareKit(
            "smart_car",
            "Smart car kit with TT motors",
            "Raspberry Pi Zero 2 W",
            (ActuatorSlot("drive", "tt_motor", 4), ActuatorSlot("steering", "micro_servo", 1, shared=True)),
            (SensorSlot("distance", "ultrasonic", 3), SensorSlot("balance", "imu", 1)),
            (KitExtra("Acrylic car chassis", 15), KitExtra("Raspberry Pi Zero 2 W", 15), KitExtra("Motor driver", 5)),
        ),
        HardwareKit(
            "servo_humanoid",
            "Servo humanoid kit, metal-gear servos",
            "Raspberry Pi 5 with a 16-channel servo driver",
            (ActuatorSlot("joint", "standard_servo", 16),),
            (SensorSlot("balance", "imu", 1), SensorSlot("touch", "foot_switch", 2)),
            (KitExtra("Aluminium bracket frame", 80), KitExtra("Raspberry Pi 5", 60), KitExtra("Servo driver", 12)),
        ),
        HardwareKit(
            "smart_servo_legs",
            "Legged robot with smart servos",
            "Raspberry Pi 5 with a serial servo adapter",
            (ActuatorSlot("joint", "smart_servo", 12), ActuatorSlot("linear", "linear_servo", 2)),
            (SensorSlot("balance", "imu", 1), SensorSlot("touch", "foot_switch", 4)),
            (KitExtra("Printed frame", 60), KitExtra("Raspberry Pi 5", 60), KitExtra("Serial servo adapter", 20)),
        ),
        HardwareKit(
            "qdd_legs",
            "Legged robot with quasi-direct-drive actuators",
            "Onboard computer with CAN bus (Jetson or NUC class)",
            (ActuatorSlot("joint", "qdd_actuator", 12),),
            (SensorSlot("balance", "imu", 1), SensorSlot("touch", "foot_switch", 4)),
            (KitExtra("Carbon frame", 600), KitExtra("Onboard computer", 500), KitExtra("6S battery", 150)),
        ),
    )
}


class UnknownKit(KeyError):
    pass


def kit(kit_id: str) -> HardwareKit:
    try:
        return KITS[kit_id]
    except KeyError as error:
        raise UnknownKit(kit_id) from error
