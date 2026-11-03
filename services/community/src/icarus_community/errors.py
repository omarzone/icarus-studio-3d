from typing import Literal

from pydantic import BaseModel, ConfigDict

ErrorCode = Literal[
    "not_signed_in", "forbidden", "banned", "not_found", "conflict", "invalid", "rate_limited", "too_large"
]
STATUS: dict[ErrorCode, int] = {
    "not_signed_in": 401,
    "forbidden": 403,
    "banned": 403,
    "not_found": 404,
    "conflict": 409,
    "invalid": 422,
    "rate_limited": 429,
    "too_large": 413,
}


class ApiError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str


class ServiceError(Exception):
    """A refusal the person can read; the API turns it into `ApiError` with the matching status."""

    def __init__(self, code: ErrorCode, message: str) -> None:
        super().__init__(message)
        self.code: ErrorCode = code
        self.message = message

    @property
    def status(self) -> int:
        return STATUS[self.code]


def not_found(what: str) -> ServiceError:
    return ServiceError("not_found", f"{what} was not found")
