"""Floor plates, displays and eyes for the scene the viewport draws: their settings come from the project, their poses
from the compiled model."""

from dataclasses import dataclass
from typing import Any

import mujoco
import numpy as np

from icarus.contracts.decor import SceneAnchor, SceneDisplay, SceneEyes, ScenePlate
from icarus.contracts.project import Project
from icarus.design.components import ComponentView, view
from icarus.design.plates import PLATE_SUFFIX
from icarus.projects.document import all_objects


@dataclass(frozen=True)
class DecorItem:
    object: str
    # The scene model's fields other than its pose or anchor.
    fields: dict[str, Any]
    # The sensor a display reads, which only the engine needs.
    sensor: str = ""


@dataclass(frozen=True)
class WorldDecor:
    plates: tuple[DecorItem, ...] = ()
    displays: tuple[DecorItem, ...] = ()
    eyes: tuple[DecorItem, ...] = ()


def _plate(component: ComponentView) -> dict[str, Any]:
    return {
        "role": component.text("role"),
        "order": component.count("order"),
        "sink": component.number("sink"),
        "color": component.text("color"),
    }


def _display(component: ComponentView) -> dict[str, Any]:
    return {
        "source": component.text("source"),
        "format": component.text("format"),
        "decimals": component.count("decimals"),
        "label": component.text("label"),
        "text": component.text("text"),
        "style": component.text("style"),
        "full_scale": component.number("full_scale"),
        "offset": component.vector("offset"),
        "heading": component.number("heading"),
        "width": component.number("width"),
        "billboard": component.switch("billboard"),
        "color": component.text("color"),
    }


def _eyes(component: ComponentView) -> dict[str, Any]:
    return {
        "size": component.number("size"),
        "spacing": component.number("spacing"),
        "height": component.number("height"),
        "facing": component.number("facing"),
        "color": component.text("color"),
        "white": component.text("white"),
        "blink_interval": component.number("blink_interval"),
        "blink_jitter": component.number("blink_jitter"),
        "look": component.text("look"),
    }


def world_decor(project: Project) -> WorldDecor:
    plates: list[DecorItem] = []
    displays: list[DecorItem] = []
    eyes: list[DecorItem] = []
    for obj in all_objects(project):
        for kind, read, into in (("plate", _plate, plates), ("display", _display, displays), ("eyes", _eyes, eyes)):
            component = view(obj, kind)
            if component is not None:
                sensor = component.text("sensor") if kind == "display" else ""
                into.append(DecorItem(obj.id, read(component), sensor))
    return WorldDecor(tuple(plates), tuple(displays), tuple(eyes))


def _vector(values: Any) -> tuple[float, float, float]:
    return (float(values[0]), float(values[1]), float(values[2]))


def _quaternion(matrix: Any) -> tuple[float, float, float, float]:
    quaternion = np.zeros(4)
    mujoco.mju_mat2Quat(quaternion, matrix)
    return (float(quaternion[0]), float(quaternion[1]), float(quaternion[2]), float(quaternion[3]))


def _geom_extents(model: mujoco.MjModel, geom: int) -> tuple[float, float, float]:
    size = model.geom_size[geom]
    match int(model.geom_type[geom]):
        case mujoco.mjtGeom.mjGEOM_BOX:
            return _vector(size * 2)
        case mujoco.mjtGeom.mjGEOM_SPHERE:
            return (2 * size[0], 2 * size[0], 2 * size[0])
        case mujoco.mjtGeom.mjGEOM_CAPSULE:
            return (2 * size[0], 2 * size[0], 2 * (size[1] + size[0]))
        case mujoco.mjtGeom.mjGEOM_CYLINDER:
            return (2 * size[0], 2 * size[0], 2 * size[1])
        case _:
            return (0.0, 0.0, 0.0)


def anchor(model: mujoco.MjModel, data: mujoco.MjData, object_id: str) -> SceneAnchor | None:
    """The object's geom (or its body, without one) at the pose `data` holds."""
    geom = int(mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, object_id))
    if geom >= 0:
        return SceneAnchor(
            object=object_id,
            geom=object_id,
            position=_vector(data.geom_xpos[geom]),
            quaternion=_quaternion(data.geom_xmat[geom]),
            size=_geom_extents(model, geom),
        )
    body = int(mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_BODY, object_id))
    if body < 0:
        return None
    return SceneAnchor(
        object=object_id, geom=None, position=_vector(data.xpos[body]), quaternion=_quaternion(data.xmat[body])
    )


def scene_plates(model: mujoco.MjModel, data: mujoco.MjData, decor: WorldDecor) -> list[ScenePlate]:
    plates: list[ScenePlate] = []
    for item in decor.plates:
        name = f"{item.object}{PLATE_SUFFIX}"
        geom = int(mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_GEOM, name))
        if geom < 0:
            continue
        circle = int(model.geom_type[geom]) == int(mujoco.mjtGeom.mjGEOM_CYLINDER)
        plates.append(
            ScenePlate(
                name=name,
                object=item.object,
                shape="cylinder" if circle else "box",
                size=_geom_extents(model, geom),
                position=_vector(data.geom_xpos[geom]),
                quaternion=_quaternion(data.geom_xmat[geom]),
                **item.fields,
            )
        )
    return plates


def scene_displays(model: mujoco.MjModel, data: mujoco.MjData, decor: WorldDecor) -> list[SceneDisplay]:
    return [
        SceneDisplay(anchor=place, **item.fields)
        for item in decor.displays
        if (place := anchor(model, data, item.object)) is not None
    ]


def scene_eyes(model: mujoco.MjModel, data: mujoco.MjData, decor: WorldDecor) -> list[SceneEyes]:
    return [
        SceneEyes(anchor=place, **item.fields)
        for item in decor.eyes
        if (place := anchor(model, data, item.object)) is not None
    ]
