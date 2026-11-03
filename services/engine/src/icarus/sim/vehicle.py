"""A vehicle's throttle, brake and steering turned into its wheel and steering actuators each control step, and
the lights those commands and the vehicle's motion switch on."""

from dataclasses import dataclass

import mujoco
import numpy as np

from icarus.contracts.scene import LightSignal
from icarus.design.vehicle import (
    BRAKE_SUFFIX,
    DRIVE_SUFFIX,
    STEER_SUFFIX,
    VehicleLayout,
    ackermann_angles,
)

THROTTLE = "throttle"
BRAKE = "brake"
STEERING = "steering"
# Commands smaller than this count as none, so a brain's idle noise does not light the lamps.
DEADBAND = 0.05
# The brake lights come on above this brake command, or while the vehicle slows faster than SLOWING m/s².
BRAKE_LIGHT = 0.1
SLOWING = 2.0
# Below this speed in m/s the vehicle counts as standing.
MOVING = 0.2


@dataclass(frozen=True)
class VehicleAction:
    id: str
    label: str
    low: float
    high: float


@dataclass
class VehicleDrive:
    """The agent's vehicle: which actuators it commands and what it was last told."""

    layout: VehicleLayout
    # Actuator index of each drive wheel and +1 for a wheel on the left, -1 on the right.
    drives: list[tuple[int, float]]
    brakes: list[int]
    steers: list[int]
    throttle: float = 0.0
    brake: float = 0.0
    steering: float = 0.0
    speed: float = 0.0
    slowing: bool = False

    @property
    def actuator_indices(self) -> frozenset[int]:
        return frozenset([index for index, _ in self.drives] + self.brakes + self.steers)

    def actions(self) -> list[VehicleAction]:
        """What the brain commands instead of the raw actuators, in order."""
        root = self.layout.root
        return [
            VehicleAction(f"{root}:{THROTTLE}", "Throttle", -1.0 if self.layout.reverse else 0.0, 1.0),
            VehicleAction(f"{root}:{BRAKE}", "Brake", 0.0, 1.0),
            VehicleAction(f"{root}:{STEERING}", "Steering", -1.0, 1.0),
        ]

    def command(self, action: str) -> float:
        match action.rpartition(":")[2]:
            case "throttle":
                return self.throttle
            case "brake":
                return self.brake
            case _:
                return self.steering

    def reset(self) -> None:
        self.throttle = self.brake = self.steering = self.speed = 0.0
        self.slowing = False


def _index(model: mujoco.MjModel, name: str) -> int:
    return int(mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_ACTUATOR, name))


def vehicle_drive(model: mujoco.MjModel, layout: VehicleLayout) -> VehicleDrive:
    drives = [
        (_index(model, f"{wheel.object}{DRIVE_SUFFIX}"), 1.0 if wheel.y >= 0 else -1.0)
        for wheel in layout.wheels
        if wheel.drive
    ]
    brakes = [_index(model, f"{wheel.object}{BRAKE_SUFFIX}") for wheel in layout.wheels]
    steers = [_index(model, f"{steer.object}{STEER_SUFFIX}") for steer in layout.steers]
    return VehicleDrive(layout, drives, [index for index in brakes if index >= 0], steers)


def drive_vehicle(vehicle: VehicleDrive, data: mujoco.MjData, commands: dict[str, float], speed: float, dt: float):
    """Set the wheel and steering actuators from throttle, brake and steering, with forward speed in m/s."""
    layout = vehicle.layout
    throttle = float(np.clip(commands.get(f"{layout.root}:{THROTTLE}", 0.0), -1.0, 1.0))
    brake = float(np.clip(commands.get(f"{layout.root}:{BRAKE}", 0.0), 0.0, 1.0))
    steering = float(np.clip(commands.get(f"{layout.root}:{STEERING}", 0.0), -1.0, 1.0))
    if not layout.reverse:
        throttle = max(throttle, 0.0)
    vehicle.slowing = abs(vehicle.speed) > MOVING and (abs(vehicle.speed) - abs(speed)) / dt > SLOWING
    vehicle.throttle, vehicle.brake, vehicle.steering, vehicle.speed = throttle, brake, steering, speed
    # Past the limit the throttle stops pushing that way; it may still slow the vehicle down.
    push = 0.0 if throttle * speed > 0 and abs(speed) >= layout.max_speed else throttle
    for index, side in vehicle.drives:
        if layout.steering == "differential":
            data.ctrl[index] = float(np.clip(push - side * steering, -1.0, 1.0))
        else:
            data.ctrl[index] = push
    for index in vehicle.brakes:
        data.ctrl[index] = brake
    for index, angle in zip(vehicle.steers, ackermann_angles(layout, steering), strict=True):
        data.ctrl[index] = angle


def light_signal(vehicle: VehicleDrive) -> LightSignal:
    """Brake while braking or slowing hard, reverse while backing or in reverse, head while driving."""
    backing = vehicle.speed < -MOVING or (vehicle.throttle < -DEADBAND and vehicle.speed < MOVING)
    return LightSignal(
        brake=vehicle.brake > BRAKE_LIGHT or vehicle.slowing,
        reverse=backing,
        head=abs(vehicle.throttle) > DEADBAND or abs(vehicle.speed) > MOVING,
    )
