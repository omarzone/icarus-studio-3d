from fastapi import APIRouter

from icarus.contracts.library import LibraryCatalog
from icarus.library.catalog import library_catalog

router = APIRouter()


@router.get("/library")
def get_library() -> LibraryCatalog:
    return library_catalog()
