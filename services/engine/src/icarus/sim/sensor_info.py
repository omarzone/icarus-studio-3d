"""The body's senses as the brain, Play and the network view name and scale them, read from the compiled model."""

from dataclasses import dataclass
from typing import Literal

import mujoco

from icarus.design.compiler import CompiledModel
from icarus.design.sensors import HEADING_SUFFIX, TARGET_SUFFIX, YAW_SUFFIX

SensorKind = Literal["ray", "accel", "gyro", "touch", "speed", "yaw", "target", "heading"]

GRAVITY = 9.81
# Display ranges for magnitudes that have no physical limit: about 3 g and 10 rad/s.
ACCEL_RANGE = 30.0
GYRO_RANGE = 10.0
# Goal distances are observed in tens of metres so they sit near the -1..1 range the policy expects.
GOAL_DISTANCE_SCALE = 10.0
# Full scale of a speed sense without its own, in m/s.
SPEED_SCALE = 10.0

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


def _kind(model: mujoco.MjModel, index: int, name: str) -> SensorKind | None:
    kind = _KINDS.get(int(model.sensor_type[index]))
    if kind == "gyro" and name.endswith(YAW_SUFFIX):
        return "yaw"
    if (kind == "heading" and not name.endswith(HEADING_SUFFIX)) or (
        kind == "target" and not name.endswith(TARGET_SUFFIX)
    ):
        return None
    return kind


def sensor_infos(compiled: CompiledModel, names: dict[str, str], agent_mass: float) -> list[SensorInfo]:
    model = compiled.model
    scales = compiled.sensor_scales
    sensors: list[SensorInfo] = []
    for index in range(model.nsensor):
        name = model.sensor(index).name
        kind = _kind(model, index, name)
        if kind is None:
            continue
        owner = names.get(name.split(":")[0], name.split(":")[0]) or ""
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
                top = scales.get(name, SPEED_SCALE)
                info = (f"{owner} speed", -top, top, "m/s")
            case "yaw":
                info = (f"{owner} turn rate", -GYRO_RANGE, GYRO_RANGE, "rad/s")
            case "target":
                info = (f"{owner} target", 0.0, scales.get(name, GOAL_DISTANCE_SCALE), "m")
            case "heading":
                info = (f"{owner} spot heading", -180.0, 180.0, "°")
        label, low, high, unit = info
        sensors.append(SensorInfo(name, label, kind, address, dim, low, high, unit, scales.get(name, 1.0), owner))
    return sensors
