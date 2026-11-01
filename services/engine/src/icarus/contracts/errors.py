from pydantic import BaseModel, ConfigDict


class ApiError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    details: dict[str, str] | None = None


class ValidationIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Dotted location in the project document, such as "objects.car.components.physics.mass".
    path: str
    message: str


class ValidationErrorBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    issues: list[ValidationIssue]
