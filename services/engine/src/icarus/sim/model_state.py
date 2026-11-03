import math
from dataclasses import dataclass, field
from typing import Literal

import mujoco
import numpy as np

from icarus.contracts.project import Project
from icarus.contracts.properties import AssetValue, NumberValue
from icarus.contracts.specs import TaskFamily
from icarus.design.compiler import CompiledModel, compile_project, is_floor_patch
from icarus.design.components import view
from icarus.design.sensors import HEADING_SUFFIX, TARGET_SUFFIX, YAW_SUFFIX
from icarus.projects.document import all_objects
from icarus.sim.gait import at_limits, feet_down, foot_bodies, landings
from icarus.sim.goal import GoalRules, check_goal, footprint, goal_rules
from icarus.sim.rewards import RewardState
from icarus.sim.vehicle import VehicleDrive, drive_vehicle, vehicle_drive

SensorKind = Literal["ray", "accel", "gyro", "touch", "speed", "yaw", "target", "heading"]

CONTROL_PERIOD = 0.05
GRAVITY = 9.81
# Display ranges for magnitudes that have no physical limit: about 3 g and 10 rad/s.
ACCEL_RANGE = 30.0
GYRO_RANGE = 10.0
# A legged body has fallen once its root drops below this fraction of its start height.
FALL_HEIGHT = 0.4
# Goal distances are observed in tens of metres so they sit near the -1..1 range the policy expects.
GOAL_DISTANCE_SCALE = 10.0
# Coverage grid side in metres when the term does not set one; matches the library default.
COVERAGE_CELL = 0.5
# A vehicle has rolled over once its up axis leans past about 60° (its z component below this).
VEHICLE_TIPPED = 0.5

_KINDS: dict[int, SensorKind] = {
    int(mujoco.mjtSensor.mjSENS_RANGEFINDER): "ray",
    int(mujoco.mjtSensor.mjSENS_ACCELEROMETER): "accel",
    int(mujoco.mjtSensor.mjSENS_GYRO): "gyro",
    int(mujoco.mjtSensor.mjSENS_TOUCH): "touch",
    int(mujoco.mjtSensor.mjSENS_VELOCIMETER): "speed",
    int(mujoco.mjtSensor.mjSENS_FRAMEPOS): "target",
    int(mujoco.mjtSensor.mjSENS_FRAMEXAXIS): "heading",
}
# What the brain reads from sensors that do not observe their raw axes, in order.
_PARTS: dict[SensorKind, tuple[str, ...]] = {
    "speed": ("forward speed", "side speed"),
    "yaw": ("turn rate",),
    "target": ("target distance", "target ahead", "target left"),
    "heading": ("spot heading ahead", "spot heading left"),
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
    # The reading the brain sees as 1, for speed and target sensors.
    scale: float = 1.0
    # The owner's name, for labels of the values the brain reads.
    owner: str = ""

    @property
    def parts(self) -> tuple[str, ...]:
        """Labels of the values the brain reads when they are not the raw axes; empty for raw readings."""
        return tuple(f"{self.owner} {part}" for part in _PARTS.get(self.kind, ()))


@dataclass(frozen=True)
class ActuatorInfo:
    id: str
    label: str
    low: float
    high: float
    unit: str | None
    # The MuJoCo actuator this action sets; None for a vehicle's throttle, brake and steering.
    index: int | None = None


@dataclass(frozen=True)
class GoalInfo:
    object: str
    site: int
    radius: float
    rules: GoalRules | None = None


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
    # qpos and qvel addresses of the body's hinge and slide joints, which locomotion observes.
    joint_addresses: list[tuple[int, int]]
    # qpos address and range of the body's limited joints, such as steering, which navigation observes.
    limited_joints: list[tuple[int, float, float]]
    # A body with a balance sensor stands on legs: it falls by dropping, not only by turning over.
    legged: bool
    # Body id of the world object the task brings to the goal, when a reward term names one.
    carried: int | None = None
    # Side of the ground grid the coverage term counts, and the cells entered since the last reset.
    cell_size: float | None = None
    visited: set[tuple[int, int]] = field(default_factory=set)
    # Body ids of the feet by the foot rule in sim/gait.py, and when each left the ground (None while down).
    feet: tuple[int, ...] = ()
    lifted_at: list[float | None] = field(default_factory=list)
    # The root height body_height aims for when the term sets one; otherwise the start height.
    target_height: float | None = None
    # The agent as a vehicle, when its root carries one, and its footprint corners for "fully inside" goals.
    vehicle: VehicleDrive | None = None
    footprint: np.ndarray = field(default_factory=lambda: np.zeros((4, 2)))


def _name_id(model: mujoco.MjModel, kind, name: str) -> int:
    return int(mujoco.mj_name2id(model, kind, name))


def _sensors(compiled: CompiledModel, names: dict[str, str], agent_mass: float) -> list[SensorInfo]:
    model = compiled.model
    sensors: list[SensorInfo] = []
    for index in range(model.nsensor):
        kind = _KINDS.get(int(model.sensor_type[index]))
        name = model.sensor(index).name
        if kind == "gyro" and name.endswith(YAW_SUFFIX):
            kind = "yaw"
        if kind is None or (kind == "heading" and not name.endswith(HEADING_SUFFIX)):
            continue
        if kind == "target" and not name.endswith(TARGET_SUFFIX):
            continue
        owner = names.get(name.split(":")[0], name.split(":")[0])
        address, dim = int(model.sensor_adr[index]), int(model.sensor_dim[index])
        match kind:
            case "ray":
                label = compiled.ray_labels.get(name, f"{owner} distance")
                info = (label, 0.0, float(model.sensor_cutoff[index]), "m")
            case "accel":
                info = (f"{owner} acceleration", 0.0, ACCEL_RANGE, "m/s²")
            case "gyro":
                info = (f"{owner} turn rate", 0.0, GYRO_RANGE, "rad/s")
            case "touch":
                info = (f"{owner} touch", 0.0, round(2 * agent_mass * GRAVITY), "N")
            case "speed":
                top = compiled.sensor_scales.get(name, 10.0)
                info = (f"{owner} speed", -top, top, "m/s")
            case "yaw":
                info = (f"{owner} turn rate", -GYRO_RANGE, GYRO_RANGE, "rad/s")
            case "target":
                info = (f"{owner} target", 0.0, compiled.sensor_scales.get(name, GOAL_DISTANCE_SCALE), "m")
            case "heading":
                info = (f"{owner} spot heading", -180.0, 180.0, "°")
        label, low, high, unit = info
        scale = compiled.sensor_scales.get(name, 1.0)
        sensors.append(SensorInfo(name, label, kind, address, dim, low, high, unit, scale, owner or ""))
    return sensors


def _actuators(model: mujoco.MjModel, names: dict[str, str], vehicle: VehicleDrive | None) -> list[ActuatorInfo]:
    """The brain's actions: a vehicle's throttle, brake and steering first, then every other actuator."""
    actions = vehicle.actions() if vehicle else []
    actuators = [ActuatorInfo(item.id, item.label, item.low, item.high, None) for item in actions]
    owned = vehicle.actuator_indices if vehicle else frozenset()
    for index in range(model.nu):
        if index in owned:
            continue
        name: str = model.actuator(index).name
        unit: str | None = None
        if int(model.actuator_biastype[index]) == int(mujoco.mjtBias.mjBIAS_AFFINE):
            joint_type = int(model.jnt_type[int(model.actuator_trnid[index, 0])])
            unit = "m" if joint_type == int(mujoco.mjtJoint.mjJNT_SLIDE) else "rad"
        low, high = (float(value) for value in model.actuator_ctrlrange[index])
        actuators.append(ActuatorInfo(name, names.get(name.split(":")[0], name), low, high, unit, index))
    return actuators


def _joint_addresses(model: mujoco.MjModel, body_objects: set[str]) -> list[tuple[int, int]]:
    moving = (int(mujoco.mjtJoint.mjJNT_HINGE), int(mujoco.mjtJoint.mjJNT_SLIDE))
    return [
        (int(model.jnt_qposadr[index]), int(model.jnt_dofadr[index]))
        for index in range(model.njnt)
        if int(model.jnt_type[index]) in moving and model.body(int(model.jnt_bodyid[index])).name in body_objects
    ]


def _limited_joints(model: mujoco.MjModel, body_objects: set[str]) -> list[tuple[int, float, float]]:
    moving = (int(mujoco.mjtJoint.mjJNT_HINGE), int(mujoco.mjtJoint.mjJNT_SLIDE))
    return [
        (int(model.jnt_qposadr[index]), float(model.jnt_range[index, 0]), float(model.jnt_range[index, 1]))
        for index in range(model.njnt)
        if int(model.jnt_type[index]) in moving
        and bool(model.jnt_limited[index])
        and model.body(int(model.jnt_bodyid[index])).name in body_objects
    ]


def _goal(project: Project, model: mujoco.MjModel) -> GoalInfo | None:
    for obj in all_objects(project):
        if view(obj, "goal_zone"):
            site = _name_id(model, mujoco.mjtObj.mjOBJ_SITE, f"{obj.id}:goal_zone")
            return GoalInfo(obj.id, site, float(model.site_size[site, 0]), goal_rules(obj))
    return None


def _carried(project: Project, model: mujoco.MjModel) -> int | None:
    term = next((item for item in project.task.rewards if item.term == "object_to_goal"), None)
    target = term.params.get("object") if term else None
    if not isinstance(target, AssetValue) or not target.value:
        return None
    body = _name_id(model, mujoco.mjtObj.mjOBJ_BODY, target.value)
    return body if body >= 0 else None


def _cell_size(project: Project) -> float | None:
    term = next((item for item in project.task.rewards if item.term == "coverage"), None)
    if term is None:
        return None
    size = term.params.get("cell_size")
    return float(size.value) if isinstance(size, NumberValue) else COVERAGE_CELL


def _target_height(project: Project) -> float | None:
    term = next((item for item in project.task.rewards if item.term == "body_height"), None)
    height = term.params.get("height") if term else None
    return float(height.value) if isinstance(height, NumberValue) else None


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
        index
        for index in range(model.ngeom)
        if int(model.geom_type[index]) == int(mujoco.mjtGeom.mjGEOM_PLANE) or is_floor_patch(model, index)
    )
    agent_mass = float(model.body_subtreemass[agent]) if agent is not None else 10.0
    layout = compiled.vehicles.get(agent_object) if agent_object else None
    vehicle = vehicle_drive(model, layout) if layout else None
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
        sensors=_sensors(compiled, names, agent_mass),
        actuators=_actuators(model, names, vehicle),
        geom_objects={
            model.geom(i).name: model.geom(i).name for i in range(model.ngeom) if model.geom(i).name in names
        },
        object_names=names,
        start_height=0.0,
        joint_addresses=_joint_addresses(model, body_objects),
        limited_joints=_limited_joints(model, body_objects),
        legged=bool(project.bodies) and any(view(obj, "balance") for obj in project.bodies[0].objects),
        carried=_carried(project, model),
        cell_size=_cell_size(project),
        target_height=_target_height(project),
        vehicle=vehicle,
    )
    reset_world(world)
    world.start_height = float(data.xpos[agent, 2]) if agent is not None else 0.0
    if agent is not None:
        bodies = {index for index in range(model.nbody) if model.body(index).name in body_objects}
        world.feet = foot_bodies(model, data, agent, bodies)
        world.lifted_at = [None] * len(world.feet)
        world.footprint = footprint(model, data, agent, agent_geoms)
    return world


def reset_world(world: LiveWorld) -> None:
    mujoco.mj_resetData(world.model, world.data)
    mujoco.mj_forward(world.model, world.data)
    world.visited.clear()
    world.lifted_at = [None] * len(world.feet)
    if world.vehicle is not None:
        world.vehicle.reset()


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


def agent_velocity(world: LiveWorld) -> np.ndarray:
    """Angular then linear velocity of the agent in its own frame."""
    velocity = np.zeros(6)
    if world.agent is not None:
        mujoco.mj_objectVelocity(world.model, world.data, mujoco.mjtObj.mjOBJ_BODY, world.agent, velocity, 1)
    return velocity


def body_velocity(world: LiveWorld, body: int) -> np.ndarray:
    """Angular then linear velocity of a body in the world frame."""
    velocity = np.zeros(6)
    mujoco.mj_objectVelocity(world.model, world.data, mujoco.mjtObj.mjOBJ_BODY, body, velocity, 0)
    return velocity


def _carried_state(world: LiveWorld) -> np.ndarray:
    """The carried object from the agent and the goal from the object, both on the ground in the agent's frame."""
    if world.carried is None or world.agent is None:
        return np.zeros(4)
    data = world.data
    frame = data.xmat[world.agent].reshape(3, 3).T
    item = data.xpos[world.carried]
    to_object = frame @ (item - data.xpos[world.agent])
    to_goal = frame @ (data.site_xpos[world.goal.site] - item) if world.goal else np.zeros(3)
    return np.array([*to_object[:2], *to_goal[:2]]) / GOAL_DISTANCE_SCALE


def _navigation_state(world: LiveWorld) -> list[np.ndarray]:
    """Forward and side speed and turn rate, limited joints from -1 to 1, then goal distance and bearing."""
    velocity = agent_velocity(world)
    qpos = world.data.qpos
    joints = [2 * (qpos[address] - low) / (high - low) - 1 for address, low, high in world.limited_joints]
    goal = goal_vector(world)
    distance = float(np.hypot(goal[0], goal[1]))
    bearing = float(np.arctan2(goal[1], goal[0])) if distance > 1e-9 else 0.0
    return [
        np.array([velocity[3], velocity[4], velocity[2]]),
        np.array(joints, dtype=float),
        np.array([distance / GOAL_DISTANCE_SCALE, np.cos(bearing), np.sin(bearing)]),
        *([_carried_state(world)] if world.carried is not None else []),
    ]


def observed_value(world: LiveWorld, sensor: SensorInfo) -> np.ndarray:
    """What the brain reads from one sensor: rays and speeds as a share of their range, the target as distance and
    bearing, the spot's heading as cosine and sine; other sensors as they read."""
    raw = sensor_value(world, sensor)
    match sensor.kind:
        case "ray":
            return raw / sensor.high
        case "speed":
            return raw[:2] / sensor.scale
        case "yaw":
            return raw[2:3]
        case "target":
            distance = float(np.hypot(raw[0], raw[1]))
            bearing = float(np.arctan2(raw[1], raw[0])) if distance > 1e-9 else 0.0
            return np.array([distance / sensor.scale, np.cos(bearing), np.sin(bearing)])
        case "heading":
            norm = float(np.hypot(raw[0], raw[1]))
            return raw[:2] / norm if norm > 1e-9 else np.array([1.0, 0.0])
        case _:
            return raw


def observation(world: LiveWorld) -> np.ndarray:
    parts = [observed_value(world, sensor) for sensor in world.sensors]
    if world.family == "navigation":
        parts += _navigation_state(world)
        if world.legged:
            parts.append(np.array([world.data.qvel[address] for _, address in world.joint_addresses], dtype=float))
    if world.family == "locomotion":
        data = world.data
        parts.append(np.array([data.qpos[address] for address, _ in world.joint_addresses], dtype=float))
        parts.append(np.array([data.qvel[address] for _, address in world.joint_addresses], dtype=float))
    return np.concatenate(parts).astype(np.float32) if parts else np.zeros(0, dtype=np.float32)


def apply_action(world: LiveWorld, action: np.ndarray) -> None:
    """Scale a -1..1 action to each actuator's control range; a vehicle turns its three into its wheels' controls."""
    clipped = np.clip(np.asarray(action, dtype=float), -1.0, 1.0)
    commands: dict[str, float] = {}
    for index, actuator in enumerate(world.actuators):
        value = actuator.low + (clipped[index] + 1) / 2 * (actuator.high - actuator.low)
        if actuator.index is None:
            commands[actuator.id] = value
        else:
            world.data.ctrl[actuator.index] = value
    if world.vehicle is not None:
        drive_vehicle(world.vehicle, world.data, commands, float(agent_velocity(world)[3]), CONTROL_PERIOD)


def command_value(world: LiveWorld, actuator: ActuatorInfo) -> float:
    """What an action is set to right now, in its own range."""
    if actuator.index is not None:
        return float(world.data.ctrl[actuator.index])
    return world.vehicle.command(actuator.id) if world.vehicle is not None else 0.0


def normalized_controls(world: LiveWorld) -> np.ndarray:
    values = [
        2 * (command_value(world, actuator) - actuator.low) / (actuator.high - actuator.low) - 1
        if actuator.high > actuator.low
        else 0.0
        for actuator in world.actuators
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
    dropped = world.agent is not None and float(position[2]) < FALL_HEIGHT * world.start_height
    match world.family:
        case "locomotion":
            fallen = dropped
        case "navigation":
            fallen = up < (VEHICLE_TIPPED if world.vehicle else 0) or (world.legged and dropped)
        case "none":
            fallen = False
    goal = data.site_xpos[world.goal.site] if world.goal else None
    carried = data.xpos[world.carried] if world.carried is not None else None
    controls = normalized_controls(world)
    down = feet_down(data, world.model, world.feet, world.agent_geoms)
    velocity = body_velocity(world, world.agent) if world.agent is not None else np.zeros(6)
    if world.cell_size is not None:
        world.visited.add((math.floor(position[0] / world.cell_size), math.floor(position[1] / world.cell_size)))
    return RewardState(
        position=(float(position[0]), float(position[1]), float(position[2])),
        forward=(float(rotation[0, 0]), float(rotation[1, 0])),
        up=up,
        goal=(float(goal[0]), float(goal[1]), float(goal[2])) if goal is not None else None,
        goal_radius=world.goal.radius if world.goal else 0.0,
        colliding=bool(touching(world)),
        fallen=fallen,
        effort=float(np.sum(controls**2)),
        speed=float(np.hypot(*agent_velocity(world)[3:5])),
        object_position=(float(carried[0]), float(carried[1]), float(carried[2])) if carried is not None else None,
        object_speed=float(np.hypot(*body_velocity(world, world.carried)[3:5])) if world.carried is not None else 0.0,
        start_height=world.start_height,
        visited=len(world.visited),
        controls=tuple(controls.tolist()),
        velocity=(float(velocity[3]), float(velocity[4])),
        feet_down=down,
        landed_air=landings(world.lifted_at, down, float(data.time)),
        at_limits=at_limits(data, world.limited_joints),
        target_height=world.target_height or world.start_height,
        **_goal_fields(world),
    )


def _goal_fields(world: LiveWorld) -> dict:
    """The goal rules' state; a classic circle keeps measuring the agent's center against its radius."""
    goal = world.goal
    if goal is None or goal.rules is None or world.agent is None:
        return {}
    check = check_goal(world.data, goal.site, goal.radius, goal.rules, world.agent, world.footprint)
    return {
        "goal_inside": None if goal.rules.classic else check.inside,
        "goal_aligned": check.aligned,
        "goal_alignment": check.alignment,
        "stop_speed": goal.rules.stop_speed,
    }
