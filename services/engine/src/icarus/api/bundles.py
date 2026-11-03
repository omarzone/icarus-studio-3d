from fastapi import APIRouter, Request

from icarus.bundles.unpack import unpack_bundle
from icarus.contracts.bundles import UnpackBundle
from icarus.contracts.project import ProjectState

router = APIRouter(prefix="/bundles")


@router.post("/unpack", status_code=201)
def unpack(request: Request, body: UnpackBundle) -> ProjectState:
    """A community bundle becomes a new local project, remixed from the creation it came from."""
    return unpack_bundle(request.app.state.store, body)
