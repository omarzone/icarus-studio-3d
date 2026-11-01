from fastapi import APIRouter, HTTPException

from icarus.contracts.library import LibraryCatalog
from icarus.contracts.scene import SceneDescription
from icarus.library.catalog import library_catalog
from icarus.library.templates import UnknownTemplate
from icarus.projects.template_scene import template_scene

router = APIRouter()


@router.get("/library")
def get_library() -> LibraryCatalog:
    return library_catalog()


@router.get("/library/templates/{template_id}/scene")
def get_template_scene(template_id: str) -> SceneDescription:
    try:
        return template_scene(template_id)
    except UnknownTemplate as error:
        raise HTTPException(status_code=404, detail=f"There is no template {template_id!r}") from error
