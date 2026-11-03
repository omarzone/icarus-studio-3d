from typing import Annotated

from fastapi import APIRouter, Query, Response

from icarus_community import catalog, moderation, publishing
from icarus_community.api.deps import ServicesDep, SessionDep, SignedIn, Viewer, Writer
from icarus_community.image_check import MEDIA_TYPES
from icarus_community.schemas.creations import (
    AppealRequest,
    Category,
    CreationDetail,
    CreationPage,
    CreationSort,
    PublishRequest,
    ReportRequest,
)

router = APIRouter(prefix="/v1")

PRIVATE_FILE_HEADERS = {"x-content-type-options": "nosniff", "cache-control": "private, max-age=300"}


@router.get("/categories")
def list_categories(db: SessionDep) -> list[Category]:
    return [Category(id=row.id, name=row.name) for row in catalog.categories(db)]


@router.get("/creations")
def list_creations(
    db: SessionDep,
    viewer: Viewer,
    sort: CreationSort = "featured",
    category: Annotated[str | None, Query(max_length=32)] = None,
    q: Annotated[str, Query(max_length=100)] = "",
    limit: Annotated[int, Query(ge=1, le=catalog.MAX_PAGE)] = 24,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CreationPage:
    return catalog.list_creations(db, viewer, sort, category, q, limit, offset)


@router.post("/creations", status_code=201)
def publish(db: SessionDep, deps: ServicesDep, actor: Writer, body: PublishRequest) -> CreationDetail:
    return publishing.publish(db, deps.files, deps.settings, actor, body)


@router.get("/creations/{creation_id}")
def get_creation(db: SessionDep, viewer: Viewer, creation_id: str) -> CreationDetail:
    return catalog.detail(db, catalog.visible_creation(db, creation_id, viewer), viewer)


@router.get("/creations/{creation_id}/thumbnail")
def get_thumbnail(db: SessionDep, deps: ServicesDep, viewer: Viewer, creation_id: str) -> Response:
    data, extension = catalog.thumbnail(db, deps.files, viewer, creation_id)
    return Response(data, media_type=MEDIA_TYPES[extension], headers=PRIVATE_FILE_HEADERS)


@router.get("/creations/{creation_id}/bundle")
def download_bundle(db: SessionDep, deps: ServicesDep, viewer: Viewer, creation_id: str) -> Response:
    data = catalog.bundle_bytes(db, deps.files, viewer, creation_id)
    return Response(
        data,
        media_type="application/json",
        headers={**PRIVATE_FILE_HEADERS, "content-disposition": f'attachment; filename="{creation_id}.icarus.json"'},
    )


@router.put("/creations/{creation_id}/vote")
def vote(db: SessionDep, actor: Writer, creation_id: str) -> CreationDetail:
    return catalog.vote(db, actor, creation_id, True)


@router.delete("/creations/{creation_id}/vote")
def unvote(db: SessionDep, actor: Writer, creation_id: str) -> CreationDetail:
    return catalog.vote(db, actor, creation_id, False)


@router.post("/creations/{creation_id}/reports", status_code=204)
def report(db: SessionDep, actor: Writer, creation_id: str, body: ReportRequest) -> Response:
    catalog.report(db, actor, creation_id, body)
    return Response(status_code=204)


@router.post("/creations/{creation_id}/appeals", status_code=204)
def appeal(db: SessionDep, actor: SignedIn, creation_id: str, body: AppealRequest) -> Response:
    moderation.appeal(db, actor, creation_id, body.message)
    return Response(status_code=204)
