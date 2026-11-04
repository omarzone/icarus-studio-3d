from datetime import UTC, datetime
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from icarus_community.file_store import FileStore
from icarus_community.models import (
    Block,
    Comment,
    Creation,
    CreationVersion,
    Follow,
    Invite,
    Notification,
    Page,
    Report,
    User,
    Vote,
)
from icarus_community.schemas.people import ProfileCreation, ProfileShelf
from icarus_community.settings import Settings


def shelf(session: Session, user: User, viewer: User | None, name: ProfileShelf) -> list[ProfileCreation]:
    own = viewer is not None and viewer.id == user.id
    if name == "drafts":
        if not own:
            return []
        pages = session.scalars(
            select(Page).where(Page.owner_id == user.id, Page.creation_id.is_(None)).order_by(Page.updated_at.desc())
        )
        return [
            ProfileCreation(id=page.project_id, title=page.title or "Untitled", status="draft", votes=0)
            for page in pages
        ]
    if not own and not user.show_creations and name != "liked":
        return []
    query = select(Creation).order_by(Creation.created_at.desc())
    if name == "liked":
        query = query.join(Vote, Vote.creation_id == Creation.id).where(Vote.user_id == user.id)
    else:
        query = query.where(Creation.owner_id == user.id)
        query = query.where(Creation.remix_of.is_not(None) if name == "remixes" else Creation.remix_of.is_(None))
    if not own:
        query = query.where(Creation.status == "public", Creation.visibility == "public")
    rows: list[ProfileCreation] = []
    for creation in session.scalars(query):
        if creation.status == "removed" and not own:
            continue
        status = "review" if creation.status == "review" else "public"
        if creation.visibility != "public" or creation.status == "removed":
            status = "private"
        rows.append(ProfileCreation(id=creation.id, title=creation.title, status=status, votes=creation.votes))
    return rows


def _rows(session: Session, model: Any, *conditions: Any) -> list[dict[str, Any]]:
    columns = model.__table__.columns
    return [
        {column.name: _plain(getattr(row, column.key)) for column in columns}
        for row in session.scalars(select(model).where(*conditions))
    ]


def _plain(value: Any) -> Any:
    return value.isoformat() if isinstance(value, datetime) else value


def export_data(session: Session, user: User) -> dict[str, Any]:
    """Everything the service keeps about one person, as JSON they can download."""
    creation_ids = list(session.scalars(select(Creation.id).where(Creation.owner_id == user.id)))
    return {
        "exported_at": datetime.now(UTC).isoformat(),
        "account": _rows(session, User, User.id == user.id)[0],
        "pages": _rows(session, Page, Page.owner_id == user.id),
        "creations": _rows(session, Creation, Creation.owner_id == user.id),
        "versions": _rows(session, CreationVersion, CreationVersion.creation_id.in_(creation_ids)),
        "invites_sent": _rows(session, Invite, Invite.page_id.in_(select(Page.id).where(Page.owner_id == user.id))),
        "votes": _rows(session, Vote, Vote.user_id == user.id),
        "comments": _rows(session, Comment, Comment.author_id == user.id),
        "reports_made": _rows(session, Report, Report.reporter_id == user.id),
        "following": _rows(session, Follow, Follow.follower_id == user.id),
        "blocked": _rows(session, Block, Block.blocker_id == user.id),
        "notifications": _rows(session, Notification, Notification.user_id == user.id),
    }


def delete_account(session: Session, files: FileStore, settings: Settings, user: User) -> bool:
    """Deletes the account, its creations and their files; returns whether the identity provider's user went too."""
    creation_ids = list(session.scalars(select(Creation.id).where(Creation.owner_id == user.id)))
    versions = list(session.scalars(select(CreationVersion).where(CreationVersion.creation_id.in_(creation_ids))))
    keys = [key for version in versions for key in (version.bundle_key, version.thumbnail_key)]
    if user.photo_key:
        keys.append(user.photo_key)
    for vote in session.scalars(select(Vote).where(Vote.user_id == user.id)):
        creation = session.get(Creation, vote.creation_id)
        if creation is not None:
            creation.votes = max(0, creation.votes - 1)
    subject = user.id
    session.delete(user)
    session.commit()
    for key in keys:
        files.delete(key)
    return _delete_identity(settings, subject)


def _delete_identity(settings: Settings, subject: str) -> bool:
    if not (settings.supabase_url and settings.supabase_service_role_key) or subject.startswith("dev-"):
        return False
    key = settings.supabase_service_role_key
    response = httpx.delete(
        f"{settings.supabase_url.rstrip('/')}/auth/v1/admin/users/{subject}",
        headers={"apikey": key, "authorization": f"Bearer {key}"},
        timeout=10,
    )
    return response.is_success
