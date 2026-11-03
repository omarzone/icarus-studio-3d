from typing import Literal

import mujoco
import numpy as np

from icarus.contracts.scene import GeomShape, SceneBody, SceneDescription, SceneGeom, SceneLight, SceneZone
from icarus.design.compiler import CompiledModel
from icarus.design.decor import scene_displays, scene_eyes, scene_plates
from icarus.design.plates import is_plate_name
from icarus.design.ray_readings import ray_readings

Shape = Literal["plane", "box", "sphere", "capsule", "cylinder"]
_MESH = int(mujoco.mjtGeom.mjGEOM_MESH)

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


_ZONE_KINDS = ("spawn_point", "goal_zone", "zone")


def _zones(model: mujoco.MjModel, data: mujoco.MjData) -> list[SceneZone]:
    """The task's places, compiled as invisible sites named "<object>:<kind>"."""
    zones: list[SceneZone] = []
    for index in range(model.nsite):
        name = model.site(index).name
        owner, _, kind = name.rpartition(":")
        if kind not in _ZONE_KINDS:
            continue
        shape: Literal["sphere", "box"] = "box" if model.site_type[index] == mujoco.mjtGeom.mjGEOM_BOX else "sphere"
        quaternion = np.zeros(4)
        mujoco.mju_mat2Quat(quaternion, data.site_xmat[index])
        zones.append(
            SceneZone(
                name=name,
                object=owner,
                kind=kind,
                shape=shape,
                size=_extents(shape, model.site_size[index]),
                position=_vector(data.site_xpos[index]),
                quaternion=_quat(quaternion),
            )
        )
    return zones


def _hex(rgba) -> str:
    return "#" + "".join(f"{round(float(channel) * 255):02x}" for channel in rgba[:3])


def _light(model: mujoco.MjModel, data: mujoco.MjData, index: int) -> SceneLight:
    diffuse = model.light_diffuse[index]
    intensity = float(np.max(diffuse))
    return SceneLight(
        name=model.light(index).name,
        position=_vector(data.light_xpos[index]),
        direction=_vector(data.light_xdir[index]),
        intensity=intensity,
        color=_hex(diffuse / intensity) if intensity > 0 else "#ffffff",
        shadows=bool(model.light_castshadow[index]),
    )


Placed = tuple[GeomShape, tuple[float, float, float], tuple[float, float, float], tuple[float, float, float, float]]


def _placed(compiled: CompiledModel, data: mujoco.MjData, index: int) -> Placed | None:
    """Shape, full size and world pose a geom is drawn with; None for geoms the scene does not draw."""
    model = compiled.model
    if int(model.geom_type[index]) == _MESH:
        built = compiled.meshes.get(model.geom(index).name)
        if built is None:
            return None
        # MuJoCo moves a mesh geom's frame to its center of mass; the part is placed at its body, as authored.
        body = int(model.geom_bodyid[index])
        return built[0], built[1], _vector(data.xpos[body]), _quat(data.xquat[body])
    shape = _SHAPES.get(int(model.geom_type[index]))
    if shape is None:
        return None
    quaternion = np.zeros(4)
    mujoco.mju_mat2Quat(quaternion, data.geom_xmat[index])
    return shape, _extents(shape, model.geom_size[index]), _vector(data.geom_xpos[index]), _quat(quaternion)


def scene_description(compiled: CompiledModel, revision: int, live: mujoco.MjData | None = None) -> SceneDescription:
    """Bodies, geoms and lights in the world frame: at the initial pose, or as `live` data already holds them."""
    model = compiled.model
    data = live if live is not None else mujoco.MjData(model)
    if live is None:
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
        name = model.geom(index).name
        placed = _placed(compiled, data, index)
        # Plates are drawn from `plates`, by role and pressed state.
        if placed is None or is_plate_name(name):
            continue
        shape, size, position, quaternion = placed
        look = compiled.looks.get(name)
        geoms.append(
            SceneGeom(
                name=name,
                body=model.body(int(model.geom_bodyid[index])).name,
                shape=shape,
                size=size,
                position=position,
                quaternion=quaternion,
                color=_hex(model.geom_rgba[index]),
                style=look.style if look else None,
                surface=look.surface if look else None,
                transparency=look.transparency if look else 0,
                reflectance=look.reflectance if look else 0,
                cast_shadow=look.cast_shadow if look else True,
                finish=look.finish if look else None,
                roughness=look.roughness if look else 0.5,
                metalness=look.metalness if look else 0.5,
                emissive=look.emissive if look else 0,
                skin=look.skin if look else None,
                light_role=look.light_role if look else None,
                bevel=look.bevel if look and shape == "box" else 0,
                ground=name in compiled.grounds,
                ornaments=list(look.ornaments) if look else [],
                material=look.material if look else None,
                decal=look.decal if look else None,
                decal_cell=look.decal_cell if look else 1,
            )
        )
    lights = [_light(model, data, index) for index in range(model.nlight)]
    zones = _zones(model, data)
    return SceneDescription(
        revision=revision,
        bodies=bodies,
        geoms=geoms,
        lights=lights,
        zones=zones,
        sky=compiled.sky,
        rays=ray_readings(model, data, compiled.ray_labels),
        plates=scene_plates(model, data, compiled.decor),
        displays=scene_displays(model, data, compiled.decor),
        eyes=scene_eyes(model, data, compiled.decor),
        agents=compiled.agents,
    )


def object_extents(compiled: CompiledModel, object_ids: list[str]) -> tuple[float, float, float] | None:
    """Full length, width and height in metres of the box around these objects' geoms at the initial pose."""
    model = compiled.model
    bodies = {
        mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, compiled.objects[id])
        for id in object_ids
        if id in compiled.objects
    }
    data = mujoco.MjData(model)
    mujoco.mj_forward(model, data)
    low, high = np.full(3, np.inf), np.full(3, -np.inf)
    for index in range(model.ngeom):
        if int(model.geom_bodyid[index]) not in bodies or int(model.geom_type[index]) == mujoco.mjtGeom.mjGEOM_PLANE:
            continue
        rotation = data.geom_xmat[index].reshape(3, 3)
        center = data.geom_xpos[index] + rotation @ model.geom_aabb[index][:3]
        half = np.abs(rotation) @ model.geom_aabb[index][3:]
        low, high = np.minimum(low, center - half), np.maximum(high, center + half)
    if not np.all(np.isfinite(low)):
        return None
    return _vector(np.round(high - low, 2))
