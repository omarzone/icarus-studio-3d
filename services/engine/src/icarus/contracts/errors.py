from pydantic import BaseModel, ConfigDict


class ApiError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    details: dict[str, str] | None = None
