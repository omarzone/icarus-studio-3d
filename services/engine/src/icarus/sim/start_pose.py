import math

import mujoco
import numpy as np

from icarus.sim.model_state import LiveWorld

START_ACROSS = 1.5
START_BACK = 2.0
START_HEADING_DEG = 35.0


def _free_joint(world: LiveWorld) -> int | None:
    model, agent = world.model, world.agent
    if agent is None or int(model.body_jntnum[agent]) < 1:
        return None
    joint = int(model.body_jntadr[agent])
    return joint if int(model.jnt_type[joint]) == int(mujoco.mjtJoint.mjJNT_FREE) else None


def place_start(world: LiveWorld, rng: np.random.Generator) -> None:
    """Move a navigation agent to a seeded start beside and behind its spawn, turned a little, so no one path fits."""
    joint = _free_joint(world)
    if world.family != "navigation" or joint is None or world.goal is None or world.agent is None:
        return
    model, data = world.model, world.data
    address = int(model.jnt_qposadr[joint])
    toward = data.site_xpos[world.goal.site][:2] - data.xpos[world.agent][:2]
    length = float(np.linalg.norm(toward))
    along = toward / length if length > 1e-9 else np.array([1.0, 0.0])
    across = np.array([-along[1], along[0]])
    offset = rng.uniform(-START_ACROSS, START_ACROSS) * across - rng.uniform(0.0, START_BACK) * along
    yaw = math.radians(rng.uniform(-START_HEADING_DEG, START_HEADING_DEG))
    data.qpos[address : address + 2] += offset
    turn = np.array([math.cos(yaw / 2), 0.0, 0.0, math.sin(yaw / 2)])
    rotated = np.zeros(4)
    mujoco.mju_mulQuat(rotated, turn, data.qpos[address + 3 : address + 7].copy())
    data.qpos[address + 3 : address + 7] = rotated
    mujoco.mj_forward(model, data)
