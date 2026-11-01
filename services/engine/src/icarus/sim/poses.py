import mujoco
import numpy as np

from icarus.contracts.training import CopyPoses
from icarus.design.scene import scene_description
from icarus.sim.model_state import LiveWorld


def moving_geoms(world: LiveWorld) -> list[int]:
    """Drawn geoms on bodies that can move; geoms welded to the world keep their scene pose."""
    model = world.model
    drawn = {geom.name for geom in scene_description(world.compiled, 0).geoms}
    return [
        index
        for index in range(model.ngeom)
        if model.geom(index).name in drawn and int(model.body_weldid[int(model.geom_bodyid[index])]) != 0
    ]


def geom_poses(world: LiveWorld, geoms: list[int]) -> CopyPoses:
    """World positions and wxyz quaternions of the given geoms as MuJoCo computed them."""
    data = world.data
    quaternion = np.zeros(4)
    positions: list[tuple[float, float, float]] = []
    quaternions: list[tuple[float, float, float, float]] = []
    for index in geoms:
        x, y, z = (float(value) for value in data.geom_xpos[index])
        positions.append((x, y, z))
        mujoco.mju_mat2Quat(quaternion, data.geom_xmat[index])
        w, i, j, k = (float(value) for value in quaternion)
        quaternions.append((w, i, j, k))
    return CopyPoses(positions=positions, quaternions=quaternions)
