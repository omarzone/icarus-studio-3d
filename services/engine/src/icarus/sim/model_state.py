from dataclasses import dataclass
from typing import Literal

import mujoco
import numpy as np

from icarus.contracts.project import Project
from icarus.contracts.specs import TaskFamily
from icarus.design.compiler import CompiledModel, compile_project
from icarus.design.components import view
from icarus.projects.document import all_objects
from icarus.sim.rewards import RewardState

SensorKind = Literal["ray", "accel", "gyro", "touch"]

CONTROL_PERIOD = 0.05
GRAVITY = 9.81
# Display ranges for magnitudes that have no physical limit: about 3 g and 10 rad/s.
ACCEL_RANGE = 30.0
GYRO_RANGE = 10.0
# Locomotion ends when the root drops below this fraction of its start height.
FALL_HEIGHT = 0.4

_KINDS: dict[int, SensorKind] = {
    int(mujoco.mjtSensor.mjSENS_RANGEFINDER): "ray",
    int(mujoco.mjtSensor.mjSENS_ACCELEROMETER): "accel",
    int(mujoco.mjtSensor.mjSENS_GYRO): "gyro",
    int(mujoco.mjtSensor.mjSENS_TOUCH): "touch",
}


@dataclass(frozen=True)
class SensorInfo:
    id: str
    label: str
    kind: SensorKind
    address: int
    dim: int
    low: float
    high: float
    unit: str


@dataclass(frozen=True)
class ActuatorInfo:
    id: str
    label: str
    low: float
    high: float
    unit: str | None


@dataclass(frozen=True)
class GoalInfo:
    object: str
    site: int
    radius: float


@dataclass
class LiveWorld:
    """A compiled project with live MuJoCo data and what Play and the environment read from it."""

    project: Project
    compiled: CompiledModel
    model: mujoco.MjModel
    data: mujoco.MjData
    family: TaskFamily
    # Body id of the first body's root object, when the project has a body.
    agent: int | None
    agent_object: str | None
    agent_geoms: frozenset[int]
    ground_geoms: frozenset[int]
    goal: GoalInfo | None
    sensors: list[SensorInfo]
    actuators: list[ActuatorInfo]
    geom_objects: dict[str, str]
    object_names: dict[str, str]
    start_height: float


def _name_id(model: mujoco.MjModel, kind, name: str) -> int:
    return int(mujoco.mj_name2id(model, kind, name))


def _sensors(model: mujoco.MjModel, names: dict[str, str], agent_mass: float) -> list[SensorInfo]:
    sensors: list[SensorInfo] = []
    for index in range(model.nsensor):
        kind = _KINDS.get(int(model.sensor_type[index]))
        if kind is None:
            continue
        name = model.sensor(index).name
        owner = names.get(name.split(":")[0], name.split(":")[0])
        address, dim = int(model.sensor_adr[index]), int(model.sensor_dim[index])
        match kind:
            case "ray":
                number = int(name.rsplit("ray", 1)[1]) + 1
                info = (f"{owner} distance {number}", 0.0, float(model.sensor_cutoff[index]), "m")
            case "accel":
                info = (f"{owner} acceleration", 0.0, ACCEL_RANGE, "m/s²")
            case "gyro":
                info = (f"{owner} turn rate", 0.0, GYRO_RANGE, "rad/s")
            case "touch":
                info = (f"{owner} touch", 0.0, round(2 * agent_mass * GRAVITY), "N")
        label, low, high, unit = info
        sensors.append(SensorInfo(name, label, kind, address, dim, low, high, unit))
    return sensors


def _actuators(model: mujoco.MjModel, names: dict[str, str]) -> list[ActuatorInfo]:
    actuators: list[ActuatorInfo] = []
    for index in range(model.nu):
        name: str = model.actuator(index).name
        unit: str | None = None
        if int(model.actuator_biastype[index]) == int(mujoco.mjtBias.mjBIAS_AFFINE):
            joint_type = int(model.jnt_type[int(model.actuator_trnid[index, 0])])
            unit = "m" if joint_type == int(mujoco.mjtJoint.mjJNT_SLIDE) else "rad"
        low, high = (float(value) for value in model.actuator_ctrlrange[index])
        actuators.append(ActuatorInfo(name, names.get(name.split(":")[0], name), low, high, unit))
    return actuators


def _goal(project: Project, model: mujoco.MjModel) -> GoalInfo | None:
    for obj in all_objects(project):
        if view(obj, "goal_zone"):
            site = _name_id(model, mujoco.mjtObj.mjOBJ_SITE, f"{obj.id}:goal_zone")
            return GoalInfo(obj.id, site, float(model.site_size[site, 0]))
    return None


def build_world(project: Project) -> LiveWorld:
    compiled = compile_project(project)
    model = compiled.model
    data = mujoco.MjData(model)
    names = {obj.id: obj.name for obj in all_objects(project)}
    agent_object = (
        next((obj.id for obj in project.bodies[0].objects if obj.parent is None), None) if project.bodies else None
    )
    agent = _name_id(model, mujoco.mjtObj.mjOBJ_BODY, agent_object) if agent_object else None
    body_objects = {obj.id for obj in project.bodies[0].objects} if project.bodies else set()
    agent_geoms = frozenset(
        index for index in range(model.ngeom) if model.body(int(model.geom_bodyid[index])).name in body_objects
    )
    ground = frozenset(
        index for index in range(model.ngeom) if int(model.geom_type[index]) == int(mujoco.mjtGeom.mjGEOM_PLANE)
    )
    agent_mass = float(model.body_subtreemass[agent]) if agent is not None else 10.0
    world = LiveWorld(
        project=project,
        compiled=compiled,
        model=model,
        data=data,
        family=project.task.family,
        agent=agent,
        agent_object=agent_object,
        agent_geoms=agent_geoms,
        ground_geoms=ground,
        goal=_goal(project, model),
        sensors=_sensors(model, names, agent_mass),
        actuators=_actuators(model, names),
        geom_objects={
            model.geom(i).name: model.geom(i).name for i in range(model.ngeom) if model.geom(i).name in names
        },
        object_names=names,
        start_height=0.0,
    )
    reset_world(world)
    world.start_height = float(data.xpos[agent, 2]) if agent is not None else 0.0
    return world


def reset_world(world: LiveWorld) -> None:
    mujoco.mj_resetData(world.model, world.data)
    mujoco.mj_forward(world.model, world.data)


def control_substeps(world: LiveWorld) -> int:
    return max(1, round(CONTROL_PERIOD / float(world.model.opt.timestep)))


def sensor_value(world: LiveWorld, sensor: SensorInfo) -> np.ndarray:
    raw = np.array(world.data.sensordata[sensor.address : sensor.address + sensor.dim], dtype=float)
    if sensor.kind == "ray":
        # A rangefinder reads -1 when nothing is within its cutoff.
        return np.where(raw < 0, sensor.high, raw)
    return raw


def goal_vector(world: LiveWorld) -> np.ndarray:
    """The goal relative to the agent, in the agent's frame."""
    if world.goal is None or world.agent is None:
        return np.zeros(3)
    offset = world.data.site_xpos[world.goal.site] - world.data.xpos[world.agent]
    return world.data.xmat[world.agent].reshape(3, 3).T @ offset


def observation(world: LiveWorld) -> np.ndarray:
    parts = [sensor_value(world, sensor) for sensor in world.sensors]
    if world.family == "navigation":
        parts.append(goal_vector(world))
    return np.concatenate(parts).astype(np.float32) if parts else np.zeros(0, dtype=np.float32)


def apply_action(world: LiveWorld, action: np.ndarray) -> None:
    """Scale a -1..1 action to each actuator's control range."""
    clipped = np.clip(np.asarray(action, dtype=float), -1.0, 1.0)
    for index, actuator in enumerate(world.actuators):
        world.data.ctrl[index] = actuator.low + (clipped[index] + 1) / 2 * (actuator.high - actuator.low)


def normalized_controls(world: LiveWorld) -> np.ndarray:
    values = [
        2 * (world.data.ctrl[index] - actuator.low) / (actuator.high - actuator.low) - 1
        if actuator.high > actuator.low
        else 0.0
        for index, actuator in enumerate(world.actuators)
    ]
    return np.array(values, dtype=float)


def touching(world: LiveWorld) -> frozenset[int]:
    """Geoms outside the agent, other than the ground, that the agent is in contact with."""
    hits: set[int] = set()
    for contact in world.data.contact[: world.data.ncon]:
        first, second = int(contact.geom1), int(contact.geom2)
        for mine, other in ((first, second), (second, first)):
            if mine in world.agent_geoms and other not in world.agent_geoms and other not in world.ground_geoms:
                hits.add(other)
    return frozenset(hits)


def reward_state(world: LiveWorld) -> RewardState:
    data = world.data
    if world.agent is None:
        position, rotation = np.zeros(3), np.eye(3)
    else:
        position, rotation = data.xpos[world.agent], data.xmat[world.agent].reshape(3, 3)
    up = float(rotation[2, 2])
    match world.family:
        case "locomotion":
            fallen = world.agent is not None and float(position[2]) < FALL_HEIGHT * world.start_height
        case "navigation":
            fallen = up < 0
        case "none":
            fallen = False
    goal = data.site_xpos[world.goal.site] if world.goal else None
    return RewardState(
        position=(float(position[0]), float(position[1]), float(position[2])),
        forward=(float(rotation[0, 0]), float(rotation[1, 0])),
        up=up,
        goal=(float(goal[0]), float(goal[1]), float(goal[2])) if goal is not None else None,
        goal_radius=world.goal.radius if world.goal else 0.0,
        colliding=bool(touching(world)),
        fallen=fallen,
        effort=float(np.sum(normalized_controls(world) ** 2)),
    )
