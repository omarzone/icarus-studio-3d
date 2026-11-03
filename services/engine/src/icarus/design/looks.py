from dataclasses import dataclass
from typing import cast, get_args

from icarus.contracts.project import Project
from icarus.contracts.scene import (
    GeomFinish,
    GeomStyle,
    GeomSurface,
    GroundDecal,
    LightRole,
    MaterialPreset,
    SceneSkin,
)
from icarus.design.components import ComponentView, view
from icarus.library.skin_objects import SKIN_ID
from icarus.projects.document import all_objects

_STYLES = set(get_args(GeomStyle))
_SURFACES = set(get_args(GeomSurface))
_FINISHES = set(get_args(GeomFinish))
_ROLES = set(get_args(LightRole))
_PRESETS = set(get_args(MaterialPreset))
_DECALS = set(get_args(GroundDecal))


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
    material: MaterialPreset | None = None
    decal: GroundDecal | None = None
    decal_cell: float = 1


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
    """Object id → look, for every object with a material or a skin; a plain style is left out so old scenes stay
    the same."""
    looks: dict[str, GeomLook] = {}
    for obj in all_objects(project):
        material = view(obj, "material")
        skin = _skin(project, view(obj, "skin"))
        if material is None:
            if skin is not None:
                looks[obj.id] = GeomLook(style=None, surface=None, skin=skin)
            continue
        ground = view(obj, "surface")
        surface = ground.text("kind") if ground else material.text("surface")
        style = material.text("style")
        finish = material.text("finish")
        preset = material.text("preset")
        floor = view(obj, "ground")
        decal = floor.text("decal") if floor else ""
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
            material=cast(MaterialPreset, preset) if preset in _PRESETS else None,
            decal=cast(GroundDecal, decal) if decal in _DECALS else None,
            decal_cell=floor.number("decal_cell") if floor else 1,
        )
    return looks
