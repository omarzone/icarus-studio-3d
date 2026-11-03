from sqlalchemy import func, select
from sqlalchemy.orm import Session

from icarus_community.accounts import blocks_between
from icarus_community.bundle_check import BundleRejected, check_bundle
from icarus_community.catalog import can_edit, can_view, detail
from icarus_community.errors import ServiceError
from icarus_community.file_store import FileStore
from icarus_community.image_check import ImageRejected, check_image
from icarus_community.models import Creation, CreationVersion, Page, User, new_id
from icarus_community.notifications import notify
from icarus_community.pages import PERMISSION_COLUMNS, page_for
from icarus_community.schemas.creations import CreationDetail, PublishRequest
from icarus_community.settings import Settings


def _ready(page: Page) -> None:
    if not page.guidelines_accepted:
        raise ServiceError("invalid", "Agree to the community guidelines before publishing")
    if not page.title:
        raise ServiceError("invalid", "Give the creation a title before publishing")
    if not page.category_id:
        raise ServiceError("invalid", "Choose a category before publishing")


def _target_page(session: Session, actor: User, request: PublishRequest) -> Page:
    """The person's own page for the project, or the owner's page when an editor publishes a version of a creation."""
    if request.creation_id is None:
        return page_for(session, actor, request.project_id)
    creation = session.get(Creation, request.creation_id)
    page = session.scalar(select(Page).where(Page.creation_id == request.creation_id))
    if creation is None or page is None or not can_edit(session, creation, actor):
        raise ServiceError("forbidden", "You cannot publish a new version of this creation")
    return page


def _remix_source(session: Session, actor: User, remix_of: str | None) -> Creation | None:
    if remix_of is None:
        return None
    original = session.get(Creation, remix_of)
    if original is None or not can_view(session, original, actor):
        raise ServiceError("invalid", "The creation this remixes is not available")
    owner = session.get(User, original.owner_id)
    allowed = original.allow_remix and owner is not None and owner.allow_remix
    if not allowed or blocks_between(session, actor.id, original.owner_id):
        raise ServiceError("forbidden", "The author of the original does not allow remixes")
    return original


def publish(
    session: Session, files: FileStore, settings: Settings, actor: User, request: PublishRequest
) -> CreationDetail:
    """Stores a new creation, or a new version of the page's creation, after checking the bundle and the picture."""
    if actor.banned:
        raise ServiceError("banned", "Your account cannot publish")
    page = _target_page(session, actor, request)
    _ready(page)
    try:
        bundle = check_bundle(request.bundle, settings.max_bundle_bytes)
        picture = check_image(request.thumbnail, settings.max_image_bytes)
    except (BundleRejected, ImageRejected) as error:
        raise ServiceError("invalid", str(error)) from error
    creation = session.get(Creation, page.creation_id) if page.creation_id else None
    if creation is not None and not can_edit(session, creation, actor):
        raise ServiceError("forbidden", "You cannot publish a new version of this creation")
    if creation is not None and creation.status == "removed":
        raise ServiceError("forbidden", "A moderator removed this creation; appeal before publishing again")
    if creation is None:
        original = _remix_source(session, actor, bundle.envelope.lineage.remix_of)
        creation = Creation(
            id=new_id(),
            owner_id=actor.id,
            title=page.title,
            description=page.description,
            category_id=page.category_id or "",
            visibility=page.visibility,
            status="review" if settings.moderation_required else "public",
            remix_of=original.id if original else None,
            **{column: getattr(page, column) for column in PERMISSION_COLUMNS.values()},
        )
        session.add(creation)
        page.creation_id = creation.id
        if original is not None:
            original.remixes += 1
            owner = session.get(User, original.owner_id)
            if owner is not None:
                notify(
                    session, owner, "remix", f"{actor.name} remixed {original.title}", actor=actor, creation=original
                )
    number = (
        session.scalar(select(func.max(CreationVersion.number)).where(CreationVersion.creation_id == creation.id)) or 0
    ) + 1
    bundle_key = f"bundles/{new_id()}.json"
    thumbnail_key = f"thumbnails/{new_id()}.{picture.extension}"
    files.put(bundle_key, bundle.data)
    files.put(thumbnail_key, picture.data)
    session.add(
        CreationVersion(
            creation_id=creation.id,
            number=number,
            note=request.note,
            bundle_key=bundle_key,
            bundle_sha256=bundle.sha256,
            bundle_bytes=len(bundle.data),
            thumbnail_key=thumbnail_key,
            contract_version=bundle.envelope.contract_version,
            library_version=bundle.envelope.library_version,
            included=request.included,
            published_by=actor.id,
        )
    )
    session.commit()
    return detail(session, creation, actor)
