from dataclasses import dataclass
from typing import cast, get_args

import mujoco
import numpy as np

from icarus.contracts.objects import ObjectSpec
from icarus.contracts.project import Project
from icarus.contracts.scene import (
    GeomFinish,
    GeomStyle,
    GeomSurface,
    LightRole,
    OrnamentStyle,
    SceneOrnament,
    SceneSkin,
)
from icarus.design.components import ComponentView, components_of, view
from icarus.library.skin_objects import SKIN_ID
from icarus.projects.document import all_objects

_STYLES = set(get_args(GeomStyle))
_SURFACES = set(get_args(GeomSurface))
_FINISHES = set(get_args(GeomFinish))
_ROLES = set(get_args(LightRole))
_ORNAMENTS = set(get_args(OrnamentStyle))


@dataclass(frozen=True)
class GeomLook:
    """How a part's geom is drawn; the physics never reads it."""

    style: GeomStyle | None
    surface: GeomSurface | None
    transparency: float = 0
    reflectance: float = 0
    cast_shadow: bool = True
    finish: GeomFinish | None = None
    roughness: float = 0.5
    metalness: float = 0.5
    emissive: float = 0
    skin: SceneSkin | None = None
    light_role: LightRole | None = None
    bevel: float = 0
    ornaments: tuple[SceneOrnament, ...] = ()


def _turn(rotation_deg: tuple[float, float, float]) -> tuple[float, float, float, float]:
    quaternion = np.zeros(4)
    mujoco.mju_euler2Quat(quaternion, np.radians(rotation_deg), "XYZ")
    return (float(quaternion[0]), float(quaternion[1]), float(quaternion[2]), float(quaternion[3]))


def _ornaments(obj: ObjectSpec) -> tuple[SceneOrnament, ...]:
    """The object's ornaments, scaled with it like its geom; look-only, so the compiler never sees them."""
    transform = view(obj, "transform")
    scale = transform.vector("scale") if transform else (1.0, 1.0, 1.0)
    found: list[SceneOrnament] = []
    for component in components_of(obj, "ornament"):
        ornament = ComponentView(component)
        style = ornament.text("style")
        if style not in _ORNAMENTS:
            continue
        size, offset = ornament.vector("size"), ornament.vector("offset")
        found.append(
            SceneOrnament(
                style=cast(OrnamentStyle, style),
                size=(size[0] * scale[0], size[1] * scale[1], size[2] * scale[2]),
                offset=(offset[0] * scale[0], offset[1] * scale[1], offset[2] * scale[2]),
                quaternion=_turn(ornament.vector("rotation")),
                color=ornament.text("color"),
                accent=ornament.text("accent"),
                emissive=ornament.number("emissive"),
            )
        )
    return tuple(found)


def _skin(project: Project, skin: ComponentView | None) -> SceneSkin | None:
    asset = skin.text("asset") if skin else ""
    if skin is None or not SKIN_ID.fullmatch(asset):
        return None
    return SceneSkin(
        project=project.id,
        asset=asset,
        fill=skin.number("fill"),
        offset=skin.vector("offset"),
        rotation=skin.vector("rotation"),
    )


def geom_looks(project: Project) -> dict[str, GeomLook]:
    """Object id → look, for every object with a material, a skin or an ornament; a plain style is left out so old
    scenes stay the same."""
    looks: dict[str, GeomLook] = {}
    for obj in all_objects(project):
        material = view(obj, "material")
        skin = _skin(project, view(obj, "skin"))
        ornaments = _ornaments(obj)
        if material is None:
            if skin is not None or ornaments:
                looks[obj.id] = GeomLook(style=None, surface=None, skin=skin, ornaments=ornaments)
            continue
        ground = view(obj, "surface")
        surface = ground.text("kind") if ground else material.text("surface")
        style = material.text("style")
        finish = material.text("finish")
        light = view(obj, "vehicle_light")
        role = light.text("role") if light else ""
        looks[obj.id] = GeomLook(
            style=cast(GeomStyle, style) if style in _STYLES and style != "plain" else None,
            surface=cast(GeomSurface, surface) if surface in _SURFACES else None,
            transparency=material.number("transparency"),
            reflectance=material.number("reflectance"),
            cast_shadow=material.switch("cast_shadow"),
            finish=cast(GeomFinish, finish) if finish in _FINISHES and finish != "plain" else None,
            roughness=material.number("roughness"),
            metalness=material.number("metalness"),
            emissive=material.number("emissive"),
            skin=skin,
            light_role=cast(LightRole, role) if role in _ROLES else None,
            bevel=material.number("bevel"),
            ornaments=ornaments,
        )
    return looks
