"""Which parts of a body are its feet, whether they touch the ground, and how hard its joints press their limits.

The foot rule: every part of the body that carries a touch sensor is a foot. A body without touch sensors uses the
tips of its legs instead: each part with no child part that hangs from the root through at least one moving joint
and whose lowest point at the start pose sits within FOOT_BAND of the root's height above the body's lowest point.
"""

import mujoco
import numpy as np

# How far above the body's lowest point, as a share of the root's height, a leg tip still counts as a foot.
FOOT_BAND = 0.25
# A joint presses its limit when it sits within this share of its range from either end.
LIMIT_MARGIN = 0.05

_MOVING = (int(mujoco.mjtJoint.mjJNT_HINGE), int(mujoco.mjtJoint.mjJNT_SLIDE))


def _touch_bodies(model: mujoco.MjModel, bodies: set[int]) -> set[int]:
    found = set()
    for index in range(model.nsensor):
        if int(model.sensor_type[index]) != int(mujoco.mjtSensor.mjSENS_TOUCH):
            continue
        if int(model.sensor_objtype[index]) != int(mujoco.mjtObj.mjOBJ_SITE):
            continue
        body = int(model.site_bodyid[int(model.sensor_objid[index])])
        if body in bodies:
            found.add(body)
    return found


def _jointed(model: mujoco.MjModel, body: int, root: int) -> bool:
    """Whether a moving joint sits on the chain from the body up to the root, the body itself included."""
    while body not in (root, 0):
        start, count = int(model.body_jntadr[body]), int(model.body_jntnum[body])
        if any(int(model.jnt_type[joint]) in _MOVING for joint in range(start, start + count)):
            return True
        body = int(model.body_parentid[body])
    return False


def _lowest(model: mujoco.MjModel, data: mujoco.MjData, body: int) -> float | None:
    geoms = [index for index in range(model.ngeom) if int(model.geom_bodyid[index]) == body]
    if not geoms:
        return None
    return min(float(data.geom_xpos[index, 2]) - float(model.geom_rbound[index]) for index in geoms)


def foot_bodies(model: mujoco.MjModel, data: mujoco.MjData, root: int, bodies: set[int]) -> tuple[int, ...]:
    """The body ids of a body's feet by the foot rule, read at the pose `data` holds."""
    touch = _touch_bodies(model, bodies)
    if touch:
        return tuple(sorted(touch))
    parents = {int(model.body_parentid[body]) for body in bodies}
    tips = [body for body in bodies if body != root and body not in parents and _jointed(model, body, root)]
    lows = {body: low for body in tips if (low := _lowest(model, data, body)) is not None}
    everything = [low for body in bodies if (low := _lowest(model, data, body)) is not None]
    if not lows or not everything:
        return ()
    bottom = min(everything)
    band = FOOT_BAND * max(float(data.xpos[root, 2]) - bottom, 0.0)
    return tuple(sorted(body for body, low in lows.items() if low <= bottom + band))


def feet_down(
    data: mujoco.MjData, model: mujoco.MjModel, feet: tuple[int, ...], body_geoms: frozenset[int]
) -> tuple[bool, ...]:
    """For each foot, whether one of its geoms touches something outside the body."""
    if not feet or data.ncon == 0:
        return (False,) * len(feet)
    owner = model.geom_bodyid
    touching: set[int] = set()
    for first, second in data.contact.geom[: data.ncon].tolist():
        if second not in body_geoms:
            touching.add(int(owner[first]))
        if first not in body_geoms:
            touching.add(int(owner[second]))
    return tuple(foot in touching for foot in feet)


def at_limits(data: mujoco.MjData, joints: list[tuple[int, float, float]]) -> float:
    """Share of the limited joints within LIMIT_MARGIN of an end of their range."""
    if not joints:
        return 0.0
    pressed = 0
    for address, low, high in joints:
        margin = LIMIT_MARGIN * (high - low)
        value = float(data.qpos[address])
        pressed += value <= low + margin or value >= high - margin
    return pressed / len(joints)


def landings(lifted_at: list[float | None], down: tuple[bool, ...], time: float) -> tuple[float, ...]:
    """Air time of each foot that lands at `time` (0 for the others), updating when each foot left the ground."""
    air = []
    for index, touching in enumerate(down):
        lifted = lifted_at[index]
        if lifted is not None and time < lifted:
            lifted = None
        if touching:
            air.append(time - lifted if lifted is not None else 0.0)
            lifted_at[index] = None
        else:
            air.append(0.0)
            lifted_at[index] = time if lifted is None else lifted
    return tuple(air)


def yaw(forward: tuple[float, float]) -> float:
    """Angle of the body's forward axis from +x on the ground, in radians."""
    return float(np.arctan2(forward[1], forward[0])) if np.hypot(*forward) > 1e-9 else 0.0
