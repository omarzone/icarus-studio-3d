from typing import Annotated

from fastapi import APIRouter, Query, Response

from icarus_community import comments
from icarus_community.api.deps import SessionDep, Viewer, Writer
from icarus_community.schemas.creations import Comment, CommentPage, CommentRequest, ReportRequest

router = APIRouter(prefix="/v1/creations/{creation_id}/comments")


@router.get("")
def list_comments(
    db: SessionDep,
    viewer: Viewer,
    creation_id: str,
    limit: Annotated[int, Query(ge=1, le=comments.MAX_PAGE)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> CommentPage:
    return comments.list_comments(db, viewer, creation_id, limit, offset)


@router.post("", status_code=201)
def post_comment(db: SessionDep, actor: Writer, creation_id: str, body: CommentRequest) -> Comment:
    return comments.post_comment(db, actor, creation_id, body.text)


@router.delete("/{comment_id}", status_code=204)
def delete_comment(db: SessionDep, actor: Writer, creation_id: str, comment_id: str) -> Response:
    comments.delete_comment(db, actor, creation_id, comment_id)
    return Response(status_code=204)


@router.post("/{comment_id}/reports", status_code=204)
def report_comment(db: SessionDep, actor: Writer, creation_id: str, comment_id: str, body: ReportRequest) -> Response:
    comments.report_comment(db, actor, creation_id, comment_id, body)
    return Response(status_code=204)
