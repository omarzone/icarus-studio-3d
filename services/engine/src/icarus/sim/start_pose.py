import math

import mujoco
import numpy as np

from icarus.sim.model_state import LiveWorld, touching
from icarus.sim.spawn_plan import SpawnPlan, SpawnSpot

START_ACROSS = 1.5
START_BACK = 2.0
START_HEADING_DEG = 35.0
# Fresh draws tried before a start inside an obstacle falls back to the spawn point itself.
CLEAR_TRIES = 8


def _free_joint(world: LiveWorld) -> int | None:
    model, agent = world.model, world.agent
    if agent is None or int(model.body_jntnum[agent]) < 1:
        return None
    joint = int(model.body_jntadr[agent])
    return joint if int(model.jnt_type[joint]) == int(mujoco.mjtJoint.mjJNT_FREE) else None


def _turned(quaternion: np.ndarray, yaw: float) -> np.ndarray:
    turn = np.array([math.cos(yaw / 2), 0.0, 0.0, math.sin(yaw / 2)])
    rotated = np.zeros(4)
    mujoco.mju_mulQuat(rotated, turn, quaternion)
    return rotated


def _near_start(world: LiveWorld, address: int, rng: np.random.Generator) -> None:
    """Beside and behind where the agent stands, turned a little, so no one path fits (Start auto)."""
    model, data = world.model, world.data
    if world.family != "navigation" or world.legged or world.goal is None or world.agent is None:
        return
    toward = data.site_xpos[world.goal.site][:2] - data.xpos[world.agent][:2]
    length = float(np.linalg.norm(toward))
    along = toward / length if length > 1e-9 else np.array([1.0, 0.0])
    across = np.array([-along[1], along[0]])
    offset = rng.uniform(-START_ACROSS, START_ACROSS) * across - rng.uniform(0.0, START_BACK) * along
    yaw = math.radians(rng.uniform(-START_HEADING_DEG, START_HEADING_DEG))
    data.qpos[address : address + 2] += offset
    data.qpos[address + 3 : address + 7] = _turned(data.qpos[address + 3 : address + 7].copy(), yaw)
    mujoco.mj_forward(model, data)


def _spot(world: LiveWorld, plan: SpawnPlan, rng: np.random.Generator) -> SpawnSpot:
    count = len(plan.spots)
    match plan.mode:
        case "random_point":
            return plan.spots[int(rng.integers(count))]
        case "cycle_points":
            turn = world.spawn_next if world.spawn_next is not None else int(rng.integers(count))
            world.spawn_next = turn + 1
            return plan.spots[turn % count]
        case _:
            return plan.spots[0]


def _draw(spot: SpawnSpot, mode: str, rng: np.random.Generator) -> tuple[float, float, float]:
    """Offset across the spot's area (along and across its heading) and the heading turn, in radians."""
    if mode == "fixed":
        return 0.0, 0.0, 0.0
    along, across = (rng.uniform(-0.5, 0.5) * side for side in spot.area)
    reach = 180.0 if spot.any_heading else spot.heading_range
    return float(along), float(across), math.radians(rng.uniform(-reach, reach))


def _place_at(world: LiveWorld, address: int, spot: SpawnSpot, draw: tuple[float, float, float]) -> None:
    model, data = world.model, world.data
    frame = data.site_xmat[spot.site].reshape(3, 3)
    heading = math.atan2(frame[1, 0], frame[0, 0])
    along, across, turn = draw
    center = data.site_xpos[spot.site]
    designed = model.qpos0[address : address + 7]
    offset = (
        np.array([math.cos(heading), math.sin(heading)]) * along
        + np.array([-math.sin(heading), math.cos(heading)]) * across
    )
    data.qpos[address : address + 2] = center[:2] + offset
    data.qpos[address + 2] = designed[2] + center[2]
    data.qpos[address + 3 : address + 7] = _turned(designed[3:7].copy(), heading + turn)
    data.qvel[:] = 0
    mujoco.mj_forward(model, data)


def place_start(world: LiveWorld, rng: np.random.Generator) -> None:
    """Move the agent to where this try starts, as its world's spawn point says, drawing from the seeded rng.

    Start auto keeps the classic start: a navigation agent shifted beside and behind its designed pose (a legged body
    keeps its pose: in a lane the shift could put it inside a wall). The other modes start at a spawn point."""
    joint = _free_joint(world)
    if joint is None or world.agent is None:
        return
    address = int(world.model.jnt_qposadr[joint])
    plan = world.spawn
    if plan is None or plan.mode == "auto" or not plan.spots:
        _near_start(world, address, rng)
        return
    spot = _spot(world, plan, rng)
    for _ in range(CLEAR_TRIES):
        _place_at(world, address, spot, _draw(spot, plan.mode, rng))
        if not touching(world):
            return
    _place_at(world, address, spot, (0.0, 0.0, 0.0))
