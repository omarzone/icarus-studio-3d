"""What a body asks of real hardware: each motor's effort, speed and travel, and each sensor's reach.

Design needs come from the compiled model's limits. With a trained brain, efforts and speeds are measured instead by
running it for one evaluation episode, so the check reflects what the brain really uses.
"""

import math
from dataclasses import dataclass, field, replace
from pathlib import Path

import mujoco
import numpy as np

from icarus.contracts.project import Project
from icarus.design.vehicle import BRAKE_SUFFIX, DRIVE_SUFFIX, STEER_SUFFIX
from icarus.library.hardware import ActuatorRole, SensorRole
from icarus.sim.model_state import LiveWorld, build_world

# Sim-only senses the brain reads that no sensor part measures directly on a device.
VIRTUAL_SENSES = {"speed": "Speed", "yaw": "Turn rate", "target": "Target position", "heading": "Spot heading"}


@dataclass(frozen=True)
class MotorNeed:
    id: str
    # The MuJoCo joint it drives.
    joint: str
    part: str
    role: ActuatorRole
    # Peak joint torque (N·m) or force (N) and speed (rad/s or m/s); speed is None when nothing states one.
    effort: float
    speed: float | None
    # Joint travel in degrees, or metres for a slide; None for joints that turn without end.
    travel: float | None
    measured: bool = False


@dataclass(frozen=True)
class SensorNeed:
    id: str
    part: str
    role: SensorRole | None
    # Reach in metres for distance sensors.
    range_m: float | None = None
    # The sense exists only in the simulator (speed, goal position); the device must estimate it another way.
    virtual: bool = False


@dataclass(frozen=True)
class BodyNeeds:
    motors: list[MotorNeed]
    sensors: list[SensorNeed]
    navigation: bool
    # Top speed of a vehicle body in m/s, for the safety rules.
    top_speed: float | None = None
    measured_from: str | None = None
    notes: list[str] = field(default_factory=list)


def _role(name: str, linear: bool, vehicle: bool) -> ActuatorRole | None:
    if vehicle and name.endswith(BRAKE_SUFFIX):
        return None
    if vehicle and name.endswith(DRIVE_SUFFIX):
        return "drive"
    if vehicle and name.endswith(STEER_SUFFIX):
        return "steering"
    return "linear" if linear else "joint"


def _effort_limit(model: mujoco.MjModel, index: int) -> float:
    """The most torque or force the actuator can put on its joint."""
    gear = abs(float(model.actuator_gear[index, 0]))
    if bool(model.actuator_forcelimited[index]):
        return gear * float(np.max(np.abs(model.actuator_forcerange[index])))
    low, high = (float(value) for value in model.actuator_ctrlrange[index])
    if int(model.actuator_biastype[index]) == int(mujoco.mjtBias.mjBIAS_NONE):
        return gear * abs(float(model.actuator_gainprm[index, 0])) * max(abs(low), abs(high))
    return gear * abs(float(model.actuator_gainprm[index, 0])) * (high - low)


def _travel(model: mujoco.MjModel, joint: int, linear: bool) -> float | None:
    if not bool(model.jnt_limited[joint]):
        return None
    low, high = (float(value) for value in model.jnt_range[joint])
    return high - low if linear else math.degrees(high - low)


def _wheel_speed(world: LiveWorld, joint_body: str) -> float | None:
    """A drive wheel's spin at the vehicle's top speed, from its radius."""
    if world.vehicle is None:
        return None
    geom = mujoco.mj_name2id(world.model, mujoco.mjtObj.mjOBJ_GEOM, joint_body)
    radius = float(world.model.geom_size[geom, 0]) if geom >= 0 else 0.0
    return world.vehicle.layout.max_speed / radius if radius > 0 else None


def motor_needs(world: LiveWorld) -> list[MotorNeed]:
    model = world.model
    body_objects = {obj.id for obj in world.project.bodies[0].objects} if world.project.bodies else set()
    needs: list[MotorNeed] = []
    for index in range(model.nu):
        joint = int(model.actuator_trnid[index, 0])
        if int(model.actuator_trntype[index]) != int(mujoco.mjtTrn.mjTRN_JOINT) or joint < 0:
            continue
        owner = str(model.body(int(model.jnt_bodyid[joint])).name)
        if owner not in body_objects:
            continue
        name = model.actuator(index).name
        linear = int(model.jnt_type[joint]) == int(mujoco.mjtJoint.mjJNT_SLIDE)
        role = _role(name, linear, world.vehicle is not None)
        if role is None:
            continue
        speed = _wheel_speed(world, owner) if role == "drive" else None
        part = world.object_names.get(owner, owner)
        effort = _effort_limit(model, index)
        travel = _travel(model, joint, linear)
        needs.append(MotorNeed(name, str(model.joint(joint).name), part, role, effort, speed, travel))
    return needs


def sensor_needs(world: LiveWorld) -> list[SensorNeed]:
    needs: list[SensorNeed] = []
    balance_owners: set[str] = set()
    for sensor in world.sensors:
        match sensor.kind:
            case "ray":
                needs.append(SensorNeed(sensor.id, sensor.label, "distance", range_m=sensor.high))
            case "accel" | "gyro":
                if sensor.owner not in balance_owners:
                    balance_owners.add(sensor.owner)
                    needs.append(SensorNeed(f"{sensor.id.split(':')[0]}:balance", f"{sensor.owner} balance", "balance"))
            case "touch":
                needs.append(SensorNeed(sensor.id, sensor.label, "touch"))
            case _:
                label = f"{sensor.owner} {VIRTUAL_SENSES[sensor.kind].lower()}".strip()
                needs.append(SensorNeed(sensor.id, label, None, virtual=True))
    if world.family == "navigation":
        needs.append(SensorNeed("goal", "Goal distance and direction", None, virtual=True))
    return needs


def _peaks(world: LiveWorld, checkpoint: Path) -> dict[str, tuple[float, float]]:
    """Peak joint torque or force and speed of every actuator over one deterministic evaluation episode."""
    from icarus.sim.env import ProjectEnv
    from icarus.sim.policy import CheckpointPolicy
    from icarus.training.evaluation import EVALUATION_SEED

    env = ProjectEnv(world.project)
    observed, _ = env.reset(seed=EVALUATION_SEED)
    policy = CheckpointPolicy.load(checkpoint, "brain", int(observed.shape[0]))
    model, data = env.world.model, env.world.data
    peaks = {model.actuator(index).name: (0.0, 0.0) for index in range(model.nu)}
    done = False
    while not done:
        observed, _, terminated, truncated, _ = env.step(policy.act(observed))
        done = terminated or truncated
        for index in range(model.nu):
            joint = int(model.actuator_trnid[index, 0])
            torque = abs(float(model.actuator_gear[index, 0]) * float(data.actuator_force[index]))
            speed = abs(float(data.qvel[int(model.jnt_dofadr[joint])])) if joint >= 0 else 0.0
            name = model.actuator(index).name
            peaks[name] = (max(peaks[name][0], torque), max(peaks[name][1], speed))
    return peaks


def body_needs(project: Project, brain: tuple[Project, Path, str] | None = None) -> BodyNeeds:
    """The body's needs; `brain` is the run's frozen project, its checkpoint and where it comes from in words."""
    world = build_world(project)
    motors = motor_needs(world)
    notes: list[str] = []
    measured_from = None
    if brain is not None:
        run_project, checkpoint, label = brain
        try:
            peaks = _peaks(build_world(run_project), checkpoint)
        except ValueError as error:
            notes.append(f"The brain could not be measured: {error}")
        else:
            motors = [
                replace(need, effort=peaks[need.id][0], speed=peaks[need.id][1], measured=True)
                if need.id in peaks
                else need
                for need in motors
            ]
            measured_from = label
    top_speed = world.vehicle.layout.max_speed if world.vehicle is not None else None
    return BodyNeeds(motors, sensor_needs(world), world.family == "navigation", top_speed, measured_from, notes)
