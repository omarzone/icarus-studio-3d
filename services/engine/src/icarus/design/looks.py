from dataclasses import dataclass
from typing import cast, get_args

from icarus.contracts.project import Project
from icarus.contracts.scene import GeomFinish, GeomStyle, GeomSurface, SceneSkin
from icarus.design.components import ComponentView, view
from icarus.library.skin_objects import SKIN_ID
from icarus.projects.document import all_objects

_STYLES = set(get_args(GeomStyle))
_SURFACES = set(get_args(GeomSurface))
_FINISHES = set(get_args(GeomFinish))


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
        )
    return looks
