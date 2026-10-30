from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from icarus import __version__
from icarus.api import health
from icarus.contracts import ApiError

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


def create_app() -> FastAPI:
    app = FastAPI(title="Icarus engine", version=__version__)
    app.include_router(health.router)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    return app
