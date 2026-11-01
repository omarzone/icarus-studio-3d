import os
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from icarus import __version__
from icarus.api import health, library, projects
from icarus.contracts import ApiError
from icarus.contracts.errors import ValidationErrorBody, ValidationIssue
from icarus.library.templates import UnknownTemplate
from icarus.projects.operations import OperationError
from icarus.projects.store import NothingToRedo, NothingToUndo, ProjectStore, RejectedBatch, UnknownProject

PROJECTS_DIR_ENV = "ICARUS_PROJECTS_DIR"

_CODES = {
    400: "bad_request",
    404: "not_found",
    405: "method_not_allowed",
    409: "conflict",
    422: "invalid",
    500: "internal",
}


def _error(status: int, error: ApiError) -> JSONResponse:
    return JSONResponse(status_code=status, content=error.model_dump())


async def _http_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    if exc.status_code == 404 and exc.detail == "Not Found":
        message = f"No route for {request.method} {request.url.path}"
    else:
        message = str(exc.detail)
    return _error(exc.status_code, ApiError(code=_CODES.get(exc.status_code, "error"), message=message))


async def _validation_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    details = {".".join(str(p) for p in e["loc"]): str(e["msg"]) for e in exc.errors()}
    return _error(422, ApiError(code="invalid", message="The request is not valid", details=details))


def _rejected(issues: list[ValidationIssue]) -> JSONResponse:
    body = ValidationErrorBody(code="invalid", message="The change was not applied", issues=issues)
    return JSONResponse(status_code=422, content=body.model_dump())


async def _domain_error(request: Request, exc: Exception) -> JSONResponse:
    match exc:
        case UnknownProject():
            return _error(404, ApiError(code="not_found", message=f"There is no project {exc.args[0]!r}"))
        case NothingToUndo():
            return _error(409, ApiError(code="conflict", message="There is nothing to undo"))
        case NothingToRedo():
            return _error(409, ApiError(code="conflict", message="There is nothing to redo"))
        case RejectedBatch() | OperationError():
            return _rejected(exc.issues)
        case UnknownTemplate():
            return _rejected([ValidationIssue(path="template", message=f"There is no template {exc.args[0]!r}")])
        case _:
            raise exc


def projects_dir() -> Path:
    configured = os.environ.get(PROJECTS_DIR_ENV)
    return Path(configured) if configured else Path.home() / "Icarus Studio" / "projects"


def create_app(projects_root: Path | None = None) -> FastAPI:
    app = FastAPI(title="Icarus engine", version=__version__)
    app.state.store = ProjectStore(projects_root or projects_dir())
    app.include_router(health.router)
    app.include_router(library.router)
    app.include_router(projects.router)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    for error in (UnknownProject, NothingToUndo, NothingToRedo, RejectedBatch, OperationError, UnknownTemplate):
        app.add_exception_handler(error, _domain_error)
    return app
