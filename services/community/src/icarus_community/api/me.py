from typing import Any

from fastapi import APIRouter, Response

from icarus_community import account_data, accounts, notifications, pages
from icarus_community.api.deps import ServicesDep, SessionDep, SignedIn, Writer
from icarus_community.errors import ServiceError
from icarus_community.image_check import ImageRejected, check_image
from icarus_community.models import new_id
from icarus_community.schemas.creations import Page, PagePatch
from icarus_community.schemas.people import (
    AccountDeleted,
    BlockRequest,
    InviteRequest,
    NotificationItem,
    NotificationSettings,
    NotificationSettingsPatch,
    PhotoRequest,
    Privacy,
    PrivacyPatch,
    Profile,
    ProfilePatch,
    RoleRequest,
    Share,
    VisibilityRequest,
)

router = APIRouter(prefix="/v1/me")


@router.get("")
def me(db: SessionDep, user: SignedIn) -> Profile:
    return accounts.profile(db, user, user)


@router.patch("")
def update_me(db: SessionDep, user: Writer, body: ProfilePatch) -> Profile:
    return accounts.profile(db, accounts.update_profile(db, user, body), user)


@router.put("/photo")
def set_photo(db: SessionDep, deps: ServicesDep, user: Writer, body: PhotoRequest) -> Profile:
    try:
        picture = check_image(body.image, deps.settings.max_image_bytes)
    except ImageRejected as error:
        raise ServiceError("invalid", str(error)) from error
    previous = user.photo_key
    key = f"photos/{new_id()}.{picture.extension}"
    deps.files.put(key, picture.data)
    user.photo_key = key
    db.commit()
    if previous:
        deps.files.delete(previous)
    return accounts.profile(db, user, user)


@router.delete("/photo")
def remove_photo(db: SessionDep, deps: ServicesDep, user: Writer) -> Profile:
    if user.photo_key:
        deps.files.delete(user.photo_key)
        user.photo_key = None
        db.commit()
    return accounts.profile(db, user, user)


def _privacy(db: SessionDep, user: SignedIn) -> Privacy:
    return Privacy(
        show_creations=user.show_creations,
        allow_remix=user.allow_remix,
        allow_comments=user.allow_comments,
        blocked=accounts.blocked_people(db, user),
    )


@router.get("/privacy")
def get_privacy(db: SessionDep, user: SignedIn) -> Privacy:
    return _privacy(db, user)


@router.patch("/privacy")
def set_privacy(db: SessionDep, user: Writer, body: PrivacyPatch) -> Privacy:
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    db.commit()
    return _privacy(db, user)


@router.post("/blocks", status_code=204)
def block(db: SessionDep, user: Writer, body: BlockRequest) -> Response:
    accounts.set_block(db, user, body.handle, True)
    return Response(status_code=204)


@router.delete("/blocks/{handle}")
def unblock(db: SessionDep, user: Writer, handle: str) -> Privacy:
    accounts.set_block(db, user, handle, False)
    return _privacy(db, user)


def _notification_settings(user: SignedIn) -> NotificationSettings:
    return NotificationSettings(
        run_finished=user.notify_run_finished,
        copilot_needs_ok=user.notify_copilot_needs_ok,
        remix_or_comment=user.notify_remix_or_comment,
        community_news=user.notify_community_news,
    )


@router.get("/notification-settings")
def get_notification_settings(user: SignedIn) -> NotificationSettings:
    return _notification_settings(user)


@router.patch("/notification-settings")
def set_notification_settings(db: SessionDep, user: Writer, body: NotificationSettingsPatch) -> NotificationSettings:
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(user, f"notify_{field}", value)
    db.commit()
    return _notification_settings(user)


@router.get("/notifications")
def list_notifications(db: SessionDep, user: SignedIn) -> list[NotificationItem]:
    return notifications.list_notifications(db, user)


@router.post("/notifications/read", status_code=204)
def mark_all_read(db: SessionDep, user: SignedIn) -> Response:
    notifications.mark_all_read(db, user)
    return Response(status_code=204)


@router.get("/pages/{project_id}")
def get_page(db: SessionDep, user: SignedIn, project_id: str) -> Page:
    return pages.page_view(db, pages.page_for(db, user, project_id))


@router.patch("/pages/{project_id}")
def update_page(db: SessionDep, user: Writer, project_id: str, body: PagePatch) -> Page:
    return pages.page_view(db, pages.update_page(db, pages.page_for(db, user, project_id), body))


@router.get("/pages/{project_id}/share")
def get_share(db: SessionDep, deps: ServicesDep, user: SignedIn, project_id: str) -> Share:
    return pages.share_view(db, pages.page_for(db, user, project_id), user, deps.settings.public_url)


@router.put("/pages/{project_id}/share/visibility")
def set_visibility(db: SessionDep, deps: ServicesDep, user: Writer, project_id: str, body: VisibilityRequest) -> Share:
    page = pages.page_for(db, user, project_id)
    pages.set_visibility(db, page, body.visibility)
    return pages.share_view(db, page, user, deps.settings.public_url)


@router.post("/pages/{project_id}/share/invites")
def invite(db: SessionDep, deps: ServicesDep, user: Writer, project_id: str, body: InviteRequest) -> Share:
    page = pages.page_for(db, user, project_id)
    pages.invite(db, page, user, body.email, body.role)
    return pages.share_view(db, page, user, deps.settings.public_url)


@router.put("/pages/{project_id}/share/invites/{invite_id}")
def set_role(
    db: SessionDep, deps: ServicesDep, user: Writer, project_id: str, invite_id: str, body: RoleRequest
) -> Share:
    page = pages.page_for(db, user, project_id)
    pages.set_role(db, page, invite_id, body.role)
    return pages.share_view(db, page, user, deps.settings.public_url)


@router.get("/export")
def export(db: SessionDep, user: SignedIn) -> dict[str, Any]:
    return account_data.export_data(db, user)


@router.delete("")
def delete_me(db: SessionDep, deps: ServicesDep, user: SignedIn) -> AccountDeleted:
    identity_deleted = account_data.delete_account(db, deps.files, deps.settings, user)
    return AccountDeleted(deleted=True, identity_deleted=identity_deleted)
