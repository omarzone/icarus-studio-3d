import colorsys
import math
from dataclasses import dataclass, replace

import mujoco
import numpy as np
from gymnasium.utils import seeding

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.project import Project
from icarus.contracts.scene import SceneDescription
from icarus.design.components import view
from icarus.design.scene import scene_description
from icarus.sim.model_state import LiveWorld, build_world, reset_world
from icarus.sim.start_pose import place_start

Vector3 = tuple[float, float, float]

# Friction of every geom no Randomize component governs varies by this fraction either way, as before Randomize.
DEFAULT_FRICTION_SPREAD = 0.2
# Fresh samples tried before a copy keeps its objects where they were designed.
OVERLAP_TRIES = 8
# Largest hue shift (fraction of the color wheel) and saturation or brightness shift of a varied color.
HUE_SHIFT = 0.05
SHADE_SHIFT = 0.15
# Uniform draws per randomized object: offset x y z, yaw, hue, saturation, brightness, friction.
DRAWS_PER_OBJECT = 8


@dataclass(frozen=True)
class ObjectVariation:
    """How one randomized object differs in a copy: offset in metres from its parent, yaw in degrees, color."""

    offset: Vector3
    yaw: float
    color: str | None


@dataclass(frozen=True)
class CopyVariation:
    # Multiplier of each geom's sliding friction, by geom index.
    friction_scale: tuple[float, ...]
    objects: dict[str, ObjectVariation]


@dataclass(frozen=True)
class _Randomized:
    object: str
    body: int
    geom: int | None
    # qpos address of the object's free joint; static and jointed objects move through body_pos instead.
    free_address: int | None
    position_range: Vector3
    rotation_range: float
    color: bool
    friction_spread: float


def _hex(rgb: np.ndarray) -> str:
    return "#" + "".join(f"{round(float(channel) * 255):02x}" for channel in rgb)


def _rgb(color: str) -> list[float]:
    return [int(color[index : index + 2], 16) / 255 for index in (1, 3, 5)]


def _shifted(rgb: np.ndarray, draws: np.ndarray) -> str:
    hue, saturation, value = colorsys.rgb_to_hsv(*(float(channel) for channel in rgb))
    hue = (hue + draws[0] * HUE_SHIFT) % 1.0
    saturation = min(max(saturation + draws[1] * SHADE_SHIFT, 0.0), 1.0)
    value = min(max(value + draws[2] * SHADE_SHIFT, 0.0), 1.0)
    return _hex(np.array(colorsys.hsv_to_rgb(hue, saturation, value)))


def _yaw_quat(degrees: float) -> np.ndarray:
    half = math.radians(degrees) / 2
    return np.array([math.cos(half), 0.0, 0.0, math.sin(half)])


def _turned(base: np.ndarray, degrees: float) -> np.ndarray:
    rotated = np.zeros(4)
    mujoco.mju_mulQuat(rotated, _yaw_quat(degrees), base)
    return rotated


class WorldVariation:
    """A live world's designed values and the per-copy variation its Randomize components ask for."""

    def __init__(self, world: LiveWorld) -> None:
        self.world = world
        model = world.model
        self._friction = model.geom_friction[:, 0].copy()
        self._rgba = model.geom_rgba.copy()
        self._body_pos = model.body_pos.copy()
        self._body_quat = model.body_quat.copy()
        self._qpos0 = model.qpos0.copy()
        self._objects = [item for obj in world.project.world.objects if (item := self._randomized(obj))]
        moving = {item.body for item in self._objects if any(item.position_range) or item.rotation_range}
        geoms = range(model.ngeom)
        self.moved_geoms = frozenset(index for index in geoms if self._inside(model.geom_bodyid[index], moving))

    def _randomized(self, obj: ObjectSpec) -> _Randomized | None:
        model = self.world.model
        component = view(obj, "randomize")
        if component is None:
            return None
        body = int(mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, obj.id))
        geom = int(mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, obj.id))
        joint = int(model.body_jntadr[body])
        free = joint >= 0 and int(model.jnt_type[joint]) == int(mujoco.mjtJoint.mjJNT_FREE)
        return _Randomized(
            object=obj.id,
            body=body,
            geom=geom if geom >= 0 else None,
            free_address=int(model.jnt_qposadr[joint]) if free else None,
            position_range=component.vector("position_range"),
            rotation_range=component.number("rotation_range"),
            color=component.switch("color"),
            friction_spread=component.number("friction_spread") / 100,
        )

    def _inside(self, body: int, roots: set[int]) -> bool:
        current = int(body)
        while current > 0:
            if current in roots:
                return True
            current = int(self.world.model.body_parentid[current])
        return False

    def sample(self, rng: np.random.Generator) -> CopyVariation:
        friction = rng.uniform(1 - DEFAULT_FRICTION_SPREAD, 1 + DEFAULT_FRICTION_SPREAD, size=self._friction.shape)
        objects: dict[str, ObjectVariation] = {}
        for item in self._objects:
            draws = rng.uniform(-1.0, 1.0, size=DRAWS_PER_OBJECT)
            x, y, z = item.position_range
            offset = (float(draws[0] * x), float(draws[1] * y), float((draws[2] + 1) / 2 * z))
            color = _shifted(self._rgba[item.geom, :3], draws[4:7]) if item.color and item.geom is not None else None
            if item.geom is not None:
                friction[item.geom] = 1 + draws[7] * item.friction_spread
            objects[item.object] = ObjectVariation(offset, float(draws[3] * item.rotation_range), color)
        return CopyVariation(tuple(float(value) for value in friction), objects)

    def restore(self) -> None:
        """Put the model back exactly as the project designed it."""
        model = self.world.model
        model.geom_friction[:, 0] = self._friction
        model.geom_rgba[:] = self._rgba
        model.body_pos[:] = self._body_pos
        model.body_quat[:] = self._body_quat
        model.qpos0[:] = self._qpos0

    def apply(self, variation: CopyVariation) -> None:
        """Edit the model so the next reset starts this copy: free objects through qpos0, the rest through body_pos."""
        self.restore()
        model = self.world.model
        model.geom_friction[:, 0] = self._friction * np.asarray(variation.friction_scale)
        for item in self._objects:
            change = variation.objects[item.object]
            if change.color is not None and item.geom is not None:
                model.geom_rgba[item.geom, :3] = _rgb(change.color)
            if item.free_address is not None:
                address = item.free_address
                model.qpos0[address : address + 3] += change.offset
                model.qpos0[address + 3 : address + 7] = _turned(self._qpos0[address + 3 : address + 7], change.yaw)
            else:
                model.body_pos[item.body] += change.offset
                model.body_quat[item.body] = _turned(self._body_quat[item.body], change.yaw)

    def _overlaps(self) -> bool:
        data, agent = self.world.data, self.world.agent_geoms
        for contact in data.contact[: data.ncon]:
            pair = {int(contact.geom1), int(contact.geom2)}
            if pair & agent and pair & self.moved_geoms:
                return True
        return False

    def _start(self, variation: CopyVariation, rng: np.random.Generator) -> None:
        self.apply(variation)
        reset_world(self.world)
        place_start(self.world, rng)

    def start_copy(self, rng: np.random.Generator) -> CopyVariation:
        """Sample a copy, reset into it and place the agent, resampling while a moved object touches the agent."""
        variation = self.sample(rng)
        for attempt in range(OVERLAP_TRIES):
            if attempt:
                variation = self.sample(rng)
            self._start(variation, rng)
            if not self.moved_geoms or not self._overlaps():
                return variation
        still = {name: replace(change, offset=(0.0, 0.0, 0.0), yaw=0.0) for name, change in variation.objects.items()}
        settled = replace(variation, objects=still)
        self._start(settled, rng)
        return settled


def copy_variation(project: Project, seed: int) -> CopyVariation:
    """The variation training copy `seed` starts its first episode with."""
    return WorldVariation(build_world(project)).start_copy(seeding.np_random(seed)[0])


def copy_scenes(project: Project, revision: int, seeds: list[int]) -> list[SceneDescription]:
    """Each copy's first episode as a scene: varied objects and the agent at its start, as training resets them."""
    world = build_world(project)
    variation = WorldVariation(world)
    scenes: list[SceneDescription] = []
    for seed in seeds:
        variation.start_copy(seeding.np_random(seed)[0])
        scenes.append(scene_description(world.compiled, revision, world.data))
    return scenes
