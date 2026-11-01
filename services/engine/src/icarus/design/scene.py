from typing import Literal

import mujoco
import numpy as np

from icarus.contracts.scene import SceneBody, SceneDescription, SceneGeom, SceneLight
from icarus.design.compiler import CompiledModel

Shape = Literal["plane", "box", "sphere", "capsule", "cylinder"]

_SHAPES: dict[int, Shape] = {
    int(mujoco.mjtGeom.mjGEOM_PLANE): "plane",
    int(mujoco.mjtGeom.mjGEOM_BOX): "box",
    int(mujoco.mjtGeom.mjGEOM_SPHERE): "sphere",
    int(mujoco.mjtGeom.mjGEOM_CAPSULE): "capsule",
    int(mujoco.mjtGeom.mjGEOM_CYLINDER): "cylinder",
}


def _vector(values) -> tuple[float, float, float]:
    return (float(values[0]), float(values[1]), float(values[2]))


def _quat(values) -> tuple[float, float, float, float]:
    unit = np.asarray(values, dtype=float) / np.linalg.norm(values)
    return (float(unit[0]), float(unit[1]), float(unit[2]), float(unit[3]))


def _extents(shape: Shape, size) -> tuple[float, float, float]:
    """MuJoCo half sizes as the full width, depth and height the editor shows."""
    match shape:
        case "box":
            return _vector(np.asarray(size) * 2)
        case "sphere":
            return (2 * size[0], 2 * size[0], 2 * size[0])
        case "capsule":
            return (2 * size[0], 2 * size[0], 2 * (size[1] + size[0]))
        case "cylinder":
            return (2 * size[0], 2 * size[0], 2 * size[1])
        case "plane":
            return (2 * size[0], 2 * size[1], 0.0)


def _hex(rgba) -> str:
    return "#" + "".join(f"{round(float(channel) * 255):02x}" for channel in rgba[:3])


def scene_description(compiled: CompiledModel, revision: int) -> SceneDescription:
    """Bodies, geoms and lights of the compiled model at its initial pose, in the world frame."""
    model = compiled.model
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    bodies = [
        SceneBody(
            name=model.body(index).name,
            parent=model.body(int(model.body_parentid[index])).name if model.body_parentid[index] else None,
            position=_vector(data.xpos[index]),
            quaternion=_quat(data.xquat[index]),
        )
        for index in range(1, model.nbody)
    ]
    geoms: list[SceneGeom] = []
    for index in range(model.ngeom):
        shape = _SHAPES.get(int(model.geom_type[index]))
        if shape is None:
            continue
        quaternion = np.zeros(4)
        mujoco.mju_mat2Quat(quaternion, data.geom_xmat[index])
        geoms.append(
            SceneGeom(
                name=model.geom(index).name,
                body=model.body(int(model.geom_bodyid[index])).name,
                shape=shape,
                size=_extents(shape, model.geom_size[index]),
                position=_vector(data.geom_xpos[index]),
                quaternion=_quat(quaternion),
                color=_hex(model.geom_rgba[index]),
            )
        )
    lights = [
        SceneLight(
            name=model.light(index).name,
            position=_vector(data.light_xpos[index]),
            direction=_vector(data.light_xdir[index]),
            intensity=float(np.max(model.light_diffuse[index])),
        )
        for index in range(model.nlight)
    ]
    return SceneDescription(revision=revision, bodies=bodies, geoms=geoms, lights=lights)
