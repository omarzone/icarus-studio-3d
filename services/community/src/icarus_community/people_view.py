from icarus_community.models import User
from icarus_community.schemas.creations import Person


def photo_path(user: User) -> str | None:
    return f"/v1/profiles/{user.handle}/photo" if user.photo_key else None


def person(user: User) -> Person:
    return Person(handle=user.handle, name=user.name, photo_path=photo_path(user))
