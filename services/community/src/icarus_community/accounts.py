import re

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from icarus_community.auth import Identity
from icarus_community.errors import ServiceError, not_found
from icarus_community.models import Block, Creation, Follow, User, new_id
from icarus_community.notifications import notify
from icarus_community.people_view import person, photo_path
from icarus_community.schemas.creations import Author, Person
from icarus_community.schemas.people import Profile, ProfilePatch, ProfileStats
from icarus_community.settings import Settings

HANDLE_SAFE = re.compile(r"[^a-z0-9_]")


def _free_handle(session: Session, email: str) -> str:
    base = HANDLE_SAFE.sub("_", email.split("@", 1)[0].lower())[:24].strip("_") or "maker"
    base = base if len(base) >= 3 else f"{base}_maker"
    handle = base
    while session.scalar(select(User.id).where(User.handle == handle)) is not None:
        handle = f"{base}_{new_id()[:4]}"
    return handle


def account_for(session: Session, identity: Identity, settings: Settings) -> User:
    """The account of a verified identity, created the first time it is seen."""
    user = session.get(User, identity.subject)
    moderator = identity.email in {email.lower() for email in settings.moderator_emails}
    if user is None:
        user = User(
            id=identity.subject,
            email=identity.email,
            handle=_free_handle(session, identity.email),
            name=identity.name or identity.email.split("@", 1)[0],
            role="moderator" if moderator else "member",
        )
        session.add(user)
        session.commit()
    elif user.email != identity.email or (moderator and user.role != "moderator"):
        user.email = identity.email
        user.role = "moderator" if moderator else user.role
        session.commit()
    return user


def user_by_handle(session: Session, handle: str) -> User:
    user = session.scalar(select(User).where(User.handle == handle.lower().lstrip("@")))
    if user is None:
        raise not_found("That person")
    return user


def public_creation_count(session: Session, user: User) -> int:
    query = select(func.count()).where(
        Creation.owner_id == user.id, Creation.status == "public", Creation.visibility == "public"
    )
    return session.scalar(query) or 0


def author(session: Session, user: User) -> Author:
    return Author(**person(user).model_dump(), creations=public_creation_count(session, user))


def blocks_between(session: Session, one: str, other: str) -> bool:
    query = select(Block).where(
        ((Block.blocker_id == one) & (Block.blocked_id == other))
        | ((Block.blocker_id == other) & (Block.blocked_id == one))
    )
    return session.scalar(query) is not None


def profile(session: Session, user: User, viewer: User | None) -> Profile:
    own = viewer is not None and viewer.id == user.id
    totals = session.execute(
        select(
            func.count(), func.coalesce(func.sum(Creation.votes), 0), func.coalesce(func.sum(Creation.remixes), 0)
        ).where(Creation.owner_id == user.id, Creation.status == "public", Creation.visibility == "public")
    ).one()
    followers = session.scalar(select(func.count()).where(Follow.followee_id == user.id)) or 0
    following = viewer is not None and session.get(Follow, (viewer.id, user.id)) is not None
    return Profile(
        handle=user.handle,
        name=user.name,
        bio=user.bio,
        location=user.location,
        website=user.website,
        photo_path=photo_path(user),
        signature_on=user.signature_on,
        own=own,
        following=following,
        role="moderator" if user.role == "moderator" else "member",
        stats=ProfileStats(
            creations=int(totals[0]) if own or user.show_creations else 0,
            votes=int(totals[1]),
            remixes=int(totals[2]),
            followers=followers,
        ),
    )


def update_profile(session: Session, user: User, patch: ProfilePatch) -> User:
    changes = patch.model_dump(exclude_none=True)
    handle = changes.get("handle")
    if handle and handle != user.handle:
        taken = session.scalar(select(User.id).where(User.handle == handle))
        if taken is not None:
            raise ServiceError("conflict", f"@{handle} is already taken")
    for field, value in changes.items():
        setattr(user, field, value)
    session.commit()
    return user


def follow(session: Session, follower: User, handle: str, on: bool) -> None:
    followee = user_by_handle(session, handle)
    if followee.id == follower.id:
        raise ServiceError("invalid", "You cannot follow yourself")
    if blocks_between(session, follower.id, followee.id):
        raise ServiceError("forbidden", "You cannot follow this person")
    existing = session.get(Follow, (follower.id, followee.id))
    if on and existing is None:
        session.add(Follow(follower_id=follower.id, followee_id=followee.id))
        notify(session, followee, "follow", f"{follower.name} started following you", actor=follower)
    elif not on and existing is not None:
        session.delete(existing)
    session.commit()


def set_block(session: Session, blocker: User, handle: str, on: bool) -> None:
    blocked = user_by_handle(session, handle)
    if blocked.id == blocker.id:
        raise ServiceError("invalid", "You cannot block yourself")
    existing = session.get(Block, (blocker.id, blocked.id))
    if on and existing is None:
        session.add(Block(blocker_id=blocker.id, blocked_id=blocked.id))
        # Blocking also ends following in both directions.
        for pair in ((blocker.id, blocked.id), (blocked.id, blocker.id)):
            follow_row = session.get(Follow, pair)
            if follow_row is not None:
                session.delete(follow_row)
    elif not on and existing is not None:
        session.delete(existing)
    session.commit()


def blocked_people(session: Session, user: User) -> list[Person]:
    rows = session.scalars(
        select(User).join(Block, Block.blocked_id == User.id).where(Block.blocker_id == user.id).order_by(User.handle)
    )
    return [person(row) for row in rows]
