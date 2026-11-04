from typing import cast

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from icarus_community.models import Block, Creation, Notification, User
from icarus_community.people_view import person
from icarus_community.schemas.people import NotificationItem, NotificationKind

MAX_LISTED = 50
# Activity on someone's creations that their "remixes or comments" setting can turn off.
ACTIVITY_KINDS = {"vote", "remix", "follow", "comment"}


def notify(
    session: Session,
    user: User,
    kind: NotificationKind,
    text: str,
    actor: User | None = None,
    creation: Creation | None = None,
) -> None:
    """Adds a notification unless the person turned that kind off or blocked whoever caused it; the caller commits."""
    if actor is not None and actor.id == user.id:
        return
    if kind in ACTIVITY_KINDS and not user.notify_remix_or_comment:
        return
    if actor is not None and session.get(Block, (user.id, actor.id)) is not None:
        return
    session.add(
        Notification(
            user_id=user.id,
            kind=kind,
            text=text[:300],
            actor_id=actor.id if actor else None,
            creation_id=creation.id if creation else None,
        )
    )


def list_notifications(session: Session, user: User) -> list[NotificationItem]:
    rows = session.scalars(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(MAX_LISTED)
    )
    items: list[NotificationItem] = []
    for row in rows:
        actor = session.get(User, row.actor_id) if row.actor_id else None
        items.append(
            NotificationItem(
                id=row.id,
                kind=cast(NotificationKind, row.kind),
                text=row.text,
                actor=person(actor) if actor else None,
                creation_id=row.creation_id,
                read=row.read,
                created_at=row.created_at,
            )
        )
    return items


def mark_all_read(session: Session, user: User) -> None:
    session.execute(update(Notification).where(Notification.user_id == user.id).values(read=True))
    session.commit()
