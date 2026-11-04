from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

Visibility = Literal["public", "unlisted", "invited", "private"]
CreationStatus = Literal["review", "public", "removed"]
PageStatus = Literal["draft", "review", "public", "removed"]
ReportReason = Literal["offensive", "stolen", "spam", "harmful", "other"]
CreationSort = Literal["featured", "recent", "most-voted"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Category(Strict):
    id: str
    name: str


class Permissions(Strict):
    remix: bool
    download_brain: bool
    retrain: bool
    commercial: bool


class PermissionsPatch(Strict):
    remix: bool | None = None
    download_brain: bool | None = None
    retrain: bool | None = None
    commercial: bool | None = None


class Person(Strict):
    handle: str
    name: str
    photo_path: str | None


class Author(Person):
    creations: int


class PagePatch(Strict):
    title: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=4000)
    category: str | None = Field(default=None, max_length=32)
    permissions: PermissionsPatch | None = None
    guidelines_accepted: bool | None = None


class Page(Strict):
    project_id: str
    title: str
    description: str
    category: str | None
    permissions: Permissions
    visibility: Visibility
    guidelines_accepted: bool
    status: PageStatus
    creation_id: str | None


class PublishRequest(Strict):
    project_id: str = Field(min_length=1, max_length=80)
    # Set by an invited editor to publish a new version of someone else's creation.
    creation_id: str | None = Field(default=None, max_length=32)
    bundle: dict[str, Any]
    # PNG, JPEG or WebP as base64 or a data URL.
    thumbnail: str = Field(min_length=1)
    note: str = Field(default="", max_length=200)
    # One line per part the bundle carries ("World · parking lot with 12 cars").
    included: list[str] = Field(default_factory=list, max_length=12)


class VersionInfo(Strict):
    number: int
    note: str
    contract_version: str
    library_version: str
    created_at: datetime


class CreationRef(Strict):
    id: str
    title: str


class CreationSummary(Strict):
    id: str
    title: str
    category: str
    author: Author
    votes: int
    remixes: int
    downloads: int
    status: CreationStatus
    visibility: Visibility
    thumbnail_path: str
    created_at: datetime


class CreationDetail(CreationSummary):
    description: str
    voted: bool
    included: list[str]
    permissions: Permissions
    versions: list[VersionInfo]
    remix_of: CreationRef | None
    can_edit: bool


class CreationPage(Strict):
    items: list[CreationSummary]
    total: int


class ReportRequest(Strict):
    reason: ReportReason
    details: str = Field(default="", max_length=1000)
    block_author: bool = False


class AppealRequest(Strict):
    message: str = Field(min_length=1, max_length=1000)


class Comment(Strict):
    id: str
    author: Person
    text: str
    created_at: datetime
    # Whether the person asking may delete it: its author or a moderator.
    can_delete: bool


class CommentPage(Strict):
    items: list[Comment]
    total: int
    # False when the creation's author turned comments off; earlier comments stay readable.
    open: bool


class CommentRequest(Strict):
    text: str = Field(min_length=1, max_length=1000)
