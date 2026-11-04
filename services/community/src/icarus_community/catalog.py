from typing import cast

from sqlalchemy import ColumnElement, and_, exists, func, or_, select
from sqlalchemy.orm import Session

from icarus_community.accounts import author, blocks_between, set_block
from icarus_community.errors import ServiceError, not_found
from icarus_community.file_store import FileStore
from icarus_community.models import Block, Category, Creation, CreationVersion, Invite, Page, Report, User, Vote
from icarus_community.notifications import notify
from icarus_community.schemas.creations import (
    CreationDetail,
    CreationPage,
    CreationRef,
    CreationSort,
    CreationStatus,
    CreationSummary,
    Permissions,
    ReportRequest,
    VersionInfo,
    Visibility,
)

MAX_PAGE = 60


def invite_role(session: Session, creation: Creation, viewer: User) -> str | None:
    query = (
        select(Invite.role)
        .join(Page, Page.id == Invite.page_id)
        .where(Page.creation_id == creation.id, Invite.email == viewer.email)
    )
    return session.scalar(query)


def can_view(session: Session, creation: Creation, viewer: User | None) -> bool:
    if viewer is not None and (viewer.id == creation.owner_id or viewer.role == "moderator"):
        return True
    if creation.status != "public":
        return False
    owner = session.get(User, creation.owner_id)
    if owner is None or owner.banned:
        return False
    if viewer is not None and blocks_between(session, viewer.id, creation.owner_id):
        return False
    if creation.visibility in ("public", "unlisted"):
        return True
    if creation.visibility == "invited" and viewer is not None:
        return invite_role(session, creation, viewer) is not None
    return False


def can_edit(session: Session, creation: Creation, viewer: User | None) -> bool:
    if viewer is None:
        return False
    return viewer.id == creation.owner_id or invite_role(session, creation, viewer) == "editor"


def visible_creation(session: Session, creation_id: str, viewer: User | None) -> Creation:
    creation = session.get(Creation, creation_id)
    if creation is None or not can_view(session, creation, viewer):
        raise not_found("That creation")
    return creation


def latest_version(session: Session, creation: Creation) -> CreationVersion:
    version = session.scalar(
        select(CreationVersion)
        .where(CreationVersion.creation_id == creation.id)
        .order_by(CreationVersion.number.desc())
        .limit(1)
    )
    if version is None:
        raise not_found("A version of that creation")
    return version


def permissions(row: Creation | Page) -> Permissions:
    return Permissions(
        remix=row.allow_remix,
        download_brain=row.allow_brain_download,
        retrain=row.allow_retrain,
        commercial=row.allow_commercial,
    )


def thumbnail_path(creation_id: str) -> str:
    return f"/v1/creations/{creation_id}/thumbnail"


def summary(session: Session, creation: Creation) -> CreationSummary:
    owner = session.get(User, creation.owner_id)
    category = session.get(Category, creation.category_id)
    if owner is None:
        raise not_found("The author of that creation")
    return CreationSummary(
        id=creation.id,
        title=creation.title,
        category=category.name if category else creation.category_id,
        author=author(session, owner),
        votes=creation.votes,
        remixes=creation.remixes,
        downloads=creation.downloads,
        status=cast(CreationStatus, creation.status),
        visibility=cast(Visibility, creation.visibility),
        thumbnail_path=thumbnail_path(creation.id),
        created_at=creation.created_at,
    )


def detail(session: Session, creation: Creation, viewer: User | None) -> CreationDetail:
    versions = list(
        session.scalars(
            select(CreationVersion)
            .where(CreationVersion.creation_id == creation.id)
            .order_by(CreationVersion.number.desc())
        )
    )
    original = session.get(Creation, creation.remix_of) if creation.remix_of else None
    voted = viewer is not None and session.get(Vote, (viewer.id, creation.id)) is not None
    return CreationDetail(
        **summary(session, creation).model_dump(),
        description=creation.description,
        voted=voted,
        included=versions[0].included if versions else [],
        permissions=permissions(creation),
        versions=[
            VersionInfo(
                number=version.number,
                note=version.note,
                contract_version=version.contract_version,
                library_version=version.library_version,
                created_at=version.created_at,
            )
            for version in versions
        ],
        remix_of=CreationRef(id=original.id, title=original.title)
        if original is not None and can_view(session, original, viewer)
        else None,
        can_edit=can_edit(session, creation, viewer),
    )


def _listed(viewer: User | None) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = [
        Creation.status == "public",
        Creation.visibility == "public",
        User.banned.is_(False),
        User.show_creations.is_(True),
    ]
    if viewer is not None:
        blocked = exists().where(
            or_(
                and_(Block.blocker_id == viewer.id, Block.blocked_id == Creation.owner_id),
                and_(Block.blocker_id == Creation.owner_id, Block.blocked_id == viewer.id),
            )
        )
        conditions.append(~blocked)
    return conditions


def list_creations(
    session: Session,
    viewer: User | None,
    sort: CreationSort,
    category: str | None,
    search: str,
    limit: int,
    offset: int,
) -> CreationPage:
    conditions = _listed(viewer)
    if category:
        conditions.append(Creation.category_id == category)
    words = search.strip()
    if words:
        pattern = f"%{words.lower()}%"
        conditions.append(
            or_(
                func.lower(Creation.title).like(pattern),
                func.lower(Creation.description).like(pattern),
                func.lower(User.name).like(pattern),
                func.lower(User.handle).like(pattern),
            )
        )
    base = select(Creation).join(User, User.id == Creation.owner_id).where(*conditions)
    order = {
        "featured": (Creation.featured.desc(), Creation.votes.desc(), Creation.created_at.desc()),
        "recent": (Creation.created_at.desc(),),
        "most-voted": (Creation.votes.desc(), Creation.created_at.desc()),
    }[sort]
    total = session.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = session.scalars(base.order_by(*order).limit(min(limit, MAX_PAGE)).offset(offset))
    return CreationPage(items=[summary(session, row) for row in rows], total=total)


def vote(session: Session, actor: User, creation_id: str, on: bool) -> CreationDetail:
    creation = visible_creation(session, creation_id, actor)
    if creation.owner_id == actor.id:
        raise ServiceError("invalid", "You cannot vote for your own creation")
    existing = session.get(Vote, (actor.id, creation.id))
    if on and existing is None:
        session.add(Vote(user_id=actor.id, creation_id=creation.id))
        creation.votes += 1
        owner = session.get(User, creation.owner_id)
        if owner is not None:
            notify(session, owner, "vote", f"{actor.name} voted for {creation.title}", actor=actor, creation=creation)
    elif not on and existing is not None:
        session.delete(existing)
        creation.votes = max(0, creation.votes - 1)
    session.commit()
    return detail(session, creation, actor)


def report(session: Session, actor: User, creation_id: str, request: ReportRequest) -> None:
    creation = visible_creation(session, creation_id, actor)
    if creation.owner_id == actor.id:
        raise ServiceError("invalid", "You cannot report your own creation")
    session.add(Report(creation_id=creation.id, reporter_id=actor.id, reason=request.reason, details=request.details))
    session.commit()
    if request.block_author:
        owner = session.get(User, creation.owner_id)
        if owner is not None:
            set_block(session, actor, owner.handle, True)


def bundle_bytes(session: Session, files: FileStore, viewer: User | None, creation_id: str) -> bytes:
    creation = visible_creation(session, creation_id, viewer)
    version = latest_version(session, creation)
    if viewer is None or viewer.id != creation.owner_id:
        creation.downloads += 1
        session.commit()
    return files.get(version.bundle_key)


def thumbnail(session: Session, files: FileStore, viewer: User | None, creation_id: str) -> tuple[bytes, str]:
    creation = visible_creation(session, creation_id, viewer)
    version = latest_version(session, creation)
    return files.get(version.thumbnail_key), version.thumbnail_key.rsplit(".", 1)[1]


def categories(session: Session) -> list[Category]:
    return list(session.scalars(select(Category).order_by(Category.position)))
