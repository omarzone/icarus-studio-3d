from fastapi import APIRouter, Response

from icarus_community import account_data, accounts
from icarus_community.api.deps import ServicesDep, SessionDep, Viewer, Writer
from icarus_community.errors import not_found
from icarus_community.image_check import MEDIA_TYPES
from icarus_community.schemas.people import Profile, ProfileCreation, ProfileShelf

router = APIRouter(prefix="/v1/profiles")


def _visible(db: SessionDep, viewer: Viewer, handle: str):  # type: ignore[no-untyped-def]
    user = accounts.user_by_handle(db, handle)
    if viewer is not None and viewer.id != user.id and accounts.blocks_between(db, viewer.id, user.id):
        raise not_found("That person")
    return user


@router.get("/{handle}")
def get_profile(db: SessionDep, viewer: Viewer, handle: str) -> Profile:
    return accounts.profile(db, _visible(db, viewer, handle), viewer)


@router.get("/{handle}/creations")
def list_profile_creations(
    db: SessionDep, viewer: Viewer, handle: str, shelf: ProfileShelf = "creations"
) -> list[ProfileCreation]:
    return account_data.shelf(db, _visible(db, viewer, handle), viewer, shelf)


@router.get("/{handle}/photo")
def get_photo(db: SessionDep, deps: ServicesDep, viewer: Viewer, handle: str) -> Response:
    user = _visible(db, viewer, handle)
    if not user.photo_key:
        raise not_found("A photo")
    extension = user.photo_key.rsplit(".", 1)[1]
    return Response(
        deps.files.get(user.photo_key),
        media_type=MEDIA_TYPES[extension],
        headers={"x-content-type-options": "nosniff", "cache-control": "private, max-age=300"},
    )


@router.put("/{handle}/follow")
def follow(db: SessionDep, actor: Writer, handle: str) -> Profile:
    accounts.follow(db, actor, handle, True)
    return accounts.profile(db, accounts.user_by_handle(db, handle), actor)


@router.delete("/{handle}/follow")
def unfollow(db: SessionDep, actor: Writer, handle: str) -> Profile:
    accounts.follow(db, actor, handle, False)
    return accounts.profile(db, accounts.user_by_handle(db, handle), actor)
