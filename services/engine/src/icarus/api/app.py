import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from icarus import __version__
from icarus.api import health, library, play, projects, runs
from icarus.contracts import ApiError
from icarus.contracts.errors import ValidationErrorBody, ValidationIssue
from icarus.library.templates import UnknownTemplate
from icarus.projects.operations import OperationError
from icarus.projects.store import (
    NothingToRedo,
    NothingToUndo,
    ProjectStore,
    RejectedBatch,
    UnknownProject,
    UnknownRevision,
)
from icarus.training.run_store import RunStore, UnknownRun, runs_dir
from icarus.training.settings import SettingsRejected, TrainingSettingsStore
from icarus.training.supervisor import NotTrainable, RunInProgress, Supervisor

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


def _operation_issue(body: object, loc: tuple, message: str) -> ValidationIssue:
    """Point a rejected operation value at the project property it was meant for."""
    if len(loc) > 3 and loc[:2] == ("body", "operations") and isinstance(body, dict):
        operations = body.get("operations")
        index = loc[2]
        if isinstance(operations, list) and isinstance(index, int) and index < len(operations):
            operation = operations[index]
            if isinstance(operation, dict) and operation.get("op") == "set_property":
                fields = (operation.get("object"), operation.get("component"), operation.get("property"))
                if all(isinstance(field, str) for field in fields):
                    return ValidationIssue(path="objects.{}.components.{}.{}".format(*fields), message=message)
    return ValidationIssue(path=".".join(str(part) for part in loc), message=message)


async def _validation_error(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    if request.url.path.endswith("/operations"):
        return _rejected([_operation_issue(exc.body, tuple(e["loc"]), str(e["msg"])) for e in exc.errors()])
    details = {".".join(str(p) for p in e["loc"]): str(e["msg"]) for e in exc.errors()}
    return _error(422, ApiError(code="invalid", message="The request is not valid", details=details))


def _rejected(issues: list[ValidationIssue]) -> JSONResponse:
    body = ValidationErrorBody(code="invalid", message="The change was not applied", issues=issues)
    return JSONResponse(status_code=422, content=body.model_dump())


async def _domain_error(request: Request, exc: Exception) -> JSONResponse:
    match exc:
        case UnknownProject():
            return _error(404, ApiError(code="not_found", message=f"There is no project {exc.args[0]!r}"))
        case UnknownRevision():
            return _error(404, ApiError(code="not_found", message=f"There is no revision {exc.args[0]}"))
        case NothingToUndo():
            return _error(409, ApiError(code="conflict", message="There is nothing to undo"))
        case NothingToRedo():
            return _error(409, ApiError(code="conflict", message="There is nothing to redo"))
        case RejectedBatch() | OperationError():
            return _rejected(exc.issues)
        case UnknownTemplate():
            return _rejected([ValidationIssue(path="template", message=f"There is no template {exc.args[0]!r}")])
        case UnknownRun():
            return _error(404, ApiError(code="not_found", message=f"There is no run {exc.args[0]!r}"))
        case RunInProgress():
            name = request.app.state.runs.folder(exc.run_id).status().name
            message = f"{name} is still training. Stop it before starting another run."
            return _error(409, ApiError(code="conflict", message=message))
        case NotTrainable():
            return _error(422, ApiError(code="invalid", message=f"This project cannot be trained: {exc}"))
        case SettingsRejected():
            details = {exc.field: exc.message}
            return _error(422, ApiError(code="invalid", message=exc.message, details=details))
        case _:
            raise exc


def projects_dir() -> Path:
    configured = os.environ.get(PROJECTS_DIR_ENV)
    return Path(configured) if configured else Path.home() / "Icarus Studio" / "projects"


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    supervisor: Supervisor = app.state.supervisor
    supervisor.recover()
    yield
    supervisor.shutdown()


def create_app(projects_root: Path | None = None, runs_root: Path | None = None) -> FastAPI:
    app = FastAPI(title="Icarus engine", version=__version__, lifespan=_lifespan)
    projects_folder = projects_root or projects_dir()
    runs_folder = runs_root or runs_dir()
    app.state.store = ProjectStore(projects_folder)
    app.state.runs = RunStore(runs_folder)
    app.state.supervisor = Supervisor(app.state.runs)
    app.state.training_settings = TrainingSettingsStore(runs_folder, projects_folder)
    app.include_router(health.router)
    app.include_router(library.router)
    app.include_router(projects.router)
    app.include_router(play.router)
    app.include_router(runs.router)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    for error in (
        UnknownProject,
        UnknownRevision,
        NothingToUndo,
        NothingToRedo,
        RejectedBatch,
        OperationError,
        UnknownTemplate,
        UnknownRun,
        RunInProgress,
        NotTrainable,
        SettingsRejected,
    ):
        app.add_exception_handler(error, _domain_error)
    return app
