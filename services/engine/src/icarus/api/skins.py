from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, Response

from icarus.contracts.skins import SkinImport, SkinImported
from icarus.projects.skin_import import import_skin
from icarus.projects.skins import SkinStore
from icarus.projects.store import ProjectStore

router = APIRouter()


def _skins(request: Request) -> SkinStore:
    return request.app.state.skins


@router.post("/projects/{project_id}/skins", status_code=201)
def import_model(request: Request, project_id: str, body: SkinImport) -> SkinImported:
    store: ProjectStore = request.app.state.store
    return import_skin(store, _skins(request), project_id, body)


@router.get("/projects/{project_id}/skins/{asset}")
def skin_content(request: Request, project_id: str, asset: str) -> Response:
    path, media_type = _skins(request).content(project_id, asset)
    # Content-addressed, so a stored model never changes under its id.
    return FileResponse(path, media_type=media_type, headers={"Cache-Control": "max-age=31536000, immutable"})
