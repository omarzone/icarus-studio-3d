import mujoco
import numpy as np

from icarus.contracts.scene import SceneRay, SceneSignals
from icarus.contracts.training import CopyPoses
from icarus.design.ray_readings import ray_readings
from icarus.design.scene import scene_description
from icarus.sim.model_state import LiveWorld

POSE_DIGITS = 3


def moving_geoms(world: LiveWorld) -> list[int]:
    """Drawn geoms on bodies that can move; geoms welded to the world keep their scene pose."""
    model = world.model
    drawn = {geom.name for geom in scene_description(world.compiled, 0).geoms}
    return [
        index
        for index in range(model.ngeom)
        if model.geom(index).name in drawn and int(model.body_weldid[int(model.geom_bodyid[index])]) != 0
    ]


def geom_poses(world: LiveWorld, geoms: list[int], rays: bool = False) -> CopyPoses:
    """World positions and wxyz quaternions of the given geoms as MuJoCo computed them, with the distance sensors
    when the view draws them."""
    return copy_poses(pose_rows(world, geoms), live_rays(world) if rays else [])


def live_rays(world: LiveWorld) -> list[SceneRay]:
    return ray_readings(world.model, world.data, {s.id: s.label for s in world.sensors}) if world.sensors else []


def pose_rows(world: LiveWorld, geoms: list[int]) -> list[list[float]]:
    """Each geom as [x, y, z, qw, qx, qy, qz]: the cheapest form a training copy can hand over every step."""
    data = world.data
    rows = np.empty((len(geoms), 7))
    rows[:, :3] = data.geom_xpos[geoms]
    matrices = data.geom_xmat
    for row, index in enumerate(geoms):
        mujoco.mju_mat2Quat(rows[row, 3:], matrices[index])
    # Millimetres and thousandths of a quaternion are finer than the view can show and keep the stream small.
    return np.round(rows, POSE_DIGITS).tolist()


def copy_poses(rows: list[list[float]], rays: list[SceneRay], signals: SceneSignals | None = None) -> CopyPoses:
    return CopyPoses(
        positions=[(row[0], row[1], row[2]) for row in rows],
        quaternions=[(row[3], row[4], row[5], row[6]) for row in rows],
        rays=rays,
        signals=signals,
    )
