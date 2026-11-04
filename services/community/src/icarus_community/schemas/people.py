from datetime import datetime
from typing import Literal

from pydantic import Field

from icarus_community.schemas.creations import Person, Strict, Visibility

HANDLE_PATTERN = r"^[a-z0-9_]{3,32}$"
Role = Literal["member", "moderator"]
NotificationKind = Literal["vote", "remix", "follow", "invite", "moderation", "comment"]
ProfileShelf = Literal["creations", "remixes", "liked", "drafts"]


class ProfileStats(Strict):
    creations: int
    votes: int
    remixes: int
    followers: int


class Profile(Strict):
    handle: str
    name: str
    bio: str
    location: str
    website: str
    photo_path: str | None
    signature_on: bool
    own: bool
    following: bool
    role: Role
    stats: ProfileStats


class ProfilePatch(Strict):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    handle: str | None = Field(default=None, pattern=HANDLE_PATTERN)
    bio: str | None = Field(default=None, max_length=300)
    location: str | None = Field(default=None, max_length=80)
    website: str | None = Field(default=None, max_length=200, pattern=r"^(https?://\S+)?$")
    signature_on: bool | None = None


class PhotoRequest(Strict):
    image: str = Field(min_length=1)


class ProfileCreation(Strict):
    id: str
    title: str
    status: Literal["draft", "review", "public", "private"]
    votes: int


class Privacy(Strict):
    show_creations: bool
    allow_remix: bool
    allow_comments: bool
    blocked: list[Person]


class PrivacyPatch(Strict):
    show_creations: bool | None = None
    allow_remix: bool | None = None
    allow_comments: bool | None = None


class NotificationSettings(Strict):
    run_finished: bool
    copilot_needs_ok: bool
    remix_or_comment: bool
    community_news: bool


class NotificationSettingsPatch(Strict):
    run_finished: bool | None = None
    copilot_needs_ok: bool | None = None
    remix_or_comment: bool | None = None
    community_news: bool | None = None


class BlockRequest(Strict):
    handle: str = Field(pattern=HANDLE_PATTERN)


class NotificationItem(Strict):
    id: str
    kind: NotificationKind
    text: str
    actor: Person | None
    creation_id: str | None
    read: bool
    created_at: datetime


class Collaborator(Strict):
    id: str
    name: str
    detail: str
    role: Literal["owner", "editor", "viewer"]


class Share(Strict):
    project_id: str
    visibility: Visibility
    link: str
    people: list[Collaborator]


class VisibilityRequest(Strict):
    visibility: Visibility


class InviteRequest(Strict):
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    role: Literal["editor", "viewer"] = "viewer"


class RoleRequest(Strict):
    role: Literal["editor", "viewer"]


class AccountDeleted(Strict):
    deleted: bool
    # Whether the sign-in identity at the identity provider was deleted too.
    identity_deleted: bool
