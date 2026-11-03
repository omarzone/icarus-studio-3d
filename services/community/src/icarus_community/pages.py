from typing import cast

from sqlalchemy import select
from sqlalchemy.orm import Session

from icarus_community.catalog import permissions
from icarus_community.errors import ServiceError
from icarus_community.models import Category, Creation, Invite, Page, User
from icarus_community.notifications import notify
from icarus_community.schemas.creations import Page as PageView
from icarus_community.schemas.creations import PagePatch, PageStatus, Visibility
from icarus_community.schemas.people import Collaborator, Share

PERMISSION_COLUMNS = {
    "remix": "allow_remix",
    "download_brain": "allow_brain_download",
    "retrain": "allow_retrain",
    "commercial": "allow_commercial",
}


def page_for(session: Session, owner: User, project_id: str) -> Page:
    """The community page of one of the person's local projects, made empty the first time it is asked for."""
    page = session.scalar(select(Page).where(Page.owner_id == owner.id, Page.project_id == project_id))
    if page is None:
        page = Page(owner_id=owner.id, project_id=project_id)
        session.add(page)
        session.commit()
    return page


def page_status(session: Session, page: Page) -> PageStatus:
    creation = session.get(Creation, page.creation_id) if page.creation_id else None
    if creation is None:
        return "draft"
    return cast(PageStatus, creation.status)


def page_view(session: Session, page: Page) -> PageView:
    return PageView(
        project_id=page.project_id,
        title=page.title,
        description=page.description,
        category=page.category_id,
        permissions=permissions(page),
        visibility=cast(Visibility, page.visibility),
        guidelines_accepted=page.guidelines_accepted,
        status=page_status(session, page),
        creation_id=page.creation_id,
    )


def update_page(session: Session, page: Page, patch: PagePatch) -> Page:
    if patch.title is not None:
        page.title = patch.title.strip()
    if patch.description is not None:
        page.description = patch.description
    if patch.category is not None:
        if session.get(Category, patch.category) is None:
            raise ServiceError("invalid", f"There is no category {patch.category}")
        page.category_id = patch.category
    if patch.guidelines_accepted is not None:
        page.guidelines_accepted = patch.guidelines_accepted
    if patch.permissions is not None:
        for name, value in patch.permissions.model_dump(exclude_none=True).items():
            setattr(page, PERMISSION_COLUMNS[name], value)
    creation = session.get(Creation, page.creation_id) if page.creation_id else None
    if creation is not None:
        # The published creation follows its page: title, text, category and permissions.
        creation.title = page.title or creation.title
        creation.description = page.description
        creation.category_id = page.category_id or creation.category_id
        for column in PERMISSION_COLUMNS.values():
            setattr(creation, column, getattr(page, column))
    session.commit()
    return page


def share_view(session: Session, page: Page, owner: User, public_url: str) -> Share:
    invites = session.scalars(select(Invite).where(Invite.page_id == page.id).order_by(Invite.created_at))
    people = [Collaborator(id=owner.id, name=owner.name, detail="you", role="owner")]
    for invite in invites:
        member = session.scalar(select(User).where(User.email == invite.email))
        people.append(
            Collaborator(
                id=invite.id,
                name=member.name if member else invite.email,
                detail=_short_email(invite.email),
                role="editor" if invite.role == "editor" else "viewer",
            )
        )
    link = f"{public_url.rstrip('/')}/v1/creations/{page.creation_id}" if page.creation_id else ""
    return Share(project_id=page.project_id, visibility=cast(Visibility, page.visibility), link=link, people=people)


def _short_email(email: str) -> str:
    name, _, domain = email.partition("@")
    return f"{name[:3]}…@{domain}" if len(name) > 3 else email


def set_visibility(session: Session, page: Page, visibility: Visibility) -> None:
    page.visibility = visibility
    creation = session.get(Creation, page.creation_id) if page.creation_id else None
    if creation is not None:
        creation.visibility = visibility
    session.commit()


def invite(session: Session, page: Page, owner: User, email: str, role: str) -> None:
    address = email.strip().lower()
    if address == owner.email:
        raise ServiceError("invalid", "You already own this project")
    existing = session.scalar(select(Invite).where(Invite.page_id == page.id, Invite.email == address))
    if existing is not None:
        existing.role = role
    else:
        session.add(Invite(page_id=page.id, email=address, role=role))
        member = session.scalar(select(User).where(User.email == address))
        creation = session.get(Creation, page.creation_id) if page.creation_id else None
        if member is not None:
            title = page.title or "a project"
            notify(session, member, "invite", f"{owner.name} invited you to {title}", actor=owner, creation=creation)
    session.commit()


def set_role(session: Session, page: Page, invite_id: str, role: str) -> None:
    row = session.get(Invite, invite_id)
    if row is None or row.page_id != page.id:
        raise ServiceError("not_found", "That person is not invited to this project")
    row.role = role
    session.commit()
