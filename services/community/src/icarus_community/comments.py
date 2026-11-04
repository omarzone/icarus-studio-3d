from sqlalchemy import ColumnElement, and_, delete, exists, func, or_, select
from sqlalchemy.orm import Session

from icarus_community.accounts import set_block
from icarus_community.catalog import visible_creation
from icarus_community.errors import ServiceError, not_found
from icarus_community.models import Block, Comment, Creation, Report, User
from icarus_community.notifications import notify
from icarus_community.people_view import person
from icarus_community.schemas.creations import Comment as CommentView
from icarus_community.schemas.creations import CommentPage, ReportRequest

MAX_PAGE = 100


def _shown(creation: Creation, viewer: User | None) -> list[ColumnElement[bool]]:
    """Comments on the creation whose authors are not suspended and do not block or are not blocked by the viewer."""
    conditions: list[ColumnElement[bool]] = [Comment.creation_id == creation.id, User.banned.is_(False)]
    if viewer is not None:
        blocked = exists().where(
            or_(
                and_(Block.blocker_id == viewer.id, Block.blocked_id == Comment.author_id),
                and_(Block.blocker_id == Comment.author_id, Block.blocked_id == viewer.id),
            )
        )
        conditions.append(~blocked)
    return conditions


def can_delete(comment: Comment, viewer: User | None) -> bool:
    return viewer is not None and (viewer.id == comment.author_id or viewer.role == "moderator")


def _view(comment: Comment, author: User, viewer: User | None) -> CommentView:
    return CommentView(
        id=comment.id,
        author=person(author),
        text=comment.text,
        created_at=comment.created_at,
        can_delete=can_delete(comment, viewer),
    )


def _comments_open(session: Session, creation: Creation) -> bool:
    owner = session.get(User, creation.owner_id)
    return owner is not None and owner.allow_comments


def list_comments(session: Session, viewer: User | None, creation_id: str, limit: int, offset: int) -> CommentPage:
    creation = visible_creation(session, creation_id, viewer)
    base = select(Comment, User).join(User, User.id == Comment.author_id).where(*_shown(creation, viewer))
    total = session.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = session.execute(base.order_by(Comment.created_at.desc()).limit(min(limit, MAX_PAGE)).offset(offset))
    return CommentPage(
        items=[_view(comment, author, viewer) for comment, author in rows],
        total=total,
        open=_comments_open(session, creation),
    )


def post_comment(session: Session, actor: User, creation_id: str, text: str) -> CommentView:
    creation = visible_creation(session, creation_id, actor)
    if not _comments_open(session, creation):
        raise ServiceError("forbidden", "The author turned comments off")
    words = text.strip()
    if not words:
        raise ServiceError("invalid", "Write something before posting")
    comment = Comment(creation_id=creation.id, author_id=actor.id, text=words)
    session.add(comment)
    owner = session.get(User, creation.owner_id)
    if owner is not None:
        notify(session, owner, "comment", f"{actor.name} commented on {creation.title}", actor=actor, creation=creation)
    session.commit()
    return _view(comment, actor, actor)


def _visible_comment(session: Session, viewer: User, creation_id: str, comment_id: str) -> Comment:
    creation = visible_creation(session, creation_id, viewer)
    comment = session.get(Comment, comment_id)
    if comment is None or comment.creation_id != creation.id:
        raise not_found("That comment")
    return comment


def delete_comment(session: Session, actor: User, creation_id: str, comment_id: str) -> None:
    comment = _visible_comment(session, actor, creation_id, comment_id)
    if not can_delete(comment, actor):
        raise ServiceError("forbidden", "Only its author or a moderator can delete a comment")
    session.execute(delete(Report).where(Report.comment_id == comment.id))
    session.delete(comment)
    session.commit()


def report_comment(session: Session, actor: User, creation_id: str, comment_id: str, request: ReportRequest) -> None:
    comment = _visible_comment(session, actor, creation_id, comment_id)
    if comment.author_id == actor.id:
        raise ServiceError("invalid", "You cannot report your own comment")
    session.add(
        Report(
            creation_id=comment.creation_id,
            comment_id=comment.id,
            reporter_id=actor.id,
            reason=request.reason,
            details=request.details,
        )
    )
    session.commit()
    if request.block_author:
        author = session.get(User, comment.author_id)
        if author is not None:
            set_block(session, actor, author.handle, True)
