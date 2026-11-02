from dataclasses import dataclass
from typing import cast, get_args

from icarus.contracts.project import Project
from icarus.contracts.scene import GeomStyle, GeomSurface
from icarus.design.components import view
from icarus.projects.document import all_objects

_STYLES = set(get_args(GeomStyle))
_SURFACES = set(get_args(GeomSurface))


@dataclass(frozen=True)
class GeomLook:
    """How a part's geom is drawn; the physics never reads it."""

    style: GeomStyle | None
    surface: GeomSurface | None
    transparency: float = 0
    reflectance: float = 0
    cast_shadow: bool = True


def geom_looks(project: Project) -> dict[str, GeomLook]:
    """Object id → look, for every object with a material; a plain style is left out so old scenes stay the same."""
    looks: dict[str, GeomLook] = {}
    for obj in all_objects(project):
        material = view(obj, "material")
        if material is None:
            continue
        ground = view(obj, "surface")
        surface = ground.text("kind") if ground else material.text("surface")
        style = material.text("style")
        looks[obj.id] = GeomLook(
            style=cast(GeomStyle, style) if style in _STYLES and style != "plain" else None,
            surface=cast(GeomSurface, surface) if surface in _SURFACES else None,
            transparency=material.number("transparency"),
            reflectance=material.number("reflectance"),
            cast_shadow=material.switch("cast_shadow"),
        )
    return looks
