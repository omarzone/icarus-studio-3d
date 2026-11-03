from typing import Literal

from pydantic import Field

from icarus_community.schemas.creations import Strict

API_VERSION = 1
ModerationQueue = Literal["reports", "new", "banned", "appeals"]


class Health(Strict):
    status: Literal["ok"]
    version: str
    api_version: int
    auth_mode: Literal["supabase", "dev"]


class DevTokenRequest(Strict):
    email: str = Field(min_length=3, max_length=320, pattern=r"^[^@\s]+@[^@\s]+$")
    name: str | None = Field(default=None, max_length=80)


class DevToken(Strict):
    access_token: str
    token_type: Literal["bearer"]
    expires_in: int


class ModerationCounts(Strict):
    reports: int
    new: int
    banned: int
    appeals: int


class ModerationItem(Strict):
    id: str
    creation: str
    author: str
    reason: str
    reports: int
    scan: str


class DecisionRequest(Strict):
    creation_id: str = Field(min_length=1, max_length=32)
    decision: Literal["keep", "remove", "ban"]
    note: str = Field(default="", max_length=500)
