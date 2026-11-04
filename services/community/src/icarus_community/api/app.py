from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from icarus_community.api import comments, creations, me, moderation, profiles, service
from icarus_community.api.deps import Services
from icarus_community.auth import TokenVerifier
from icarus_community.db import Database
from icarus_community.errors import ApiError, ServiceError
from icarus_community.file_store import FileStore, LocalFileStore
from icarus_community.rate_limit import WriteLimiter
from icarus_community.settings import Settings, load_settings

# Base64 adds a third to a bundle and its picture, plus room for the page text.
BODY_OVERHEAD = 1.5


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(ApiError(code=code, message=message).model_dump(), status_code=status)


def create_app(
    settings: Settings | None = None, files: FileStore | None = None, verifier: TokenVerifier | None = None
) -> FastAPI:
    settings = settings or load_settings()
    app = FastAPI(title="Icarus Community", version="1", docs_url="/docs" if settings.env != "production" else None)
    app.state.services = Services(
        settings=settings,
        database=Database(settings.database_url),
        files=files or LocalFileStore(settings.files_dir),
        verifier=verifier or TokenVerifier(settings),
        limiter=WriteLimiter(settings.writes_per_minute),
    )
    body_limit = int((settings.max_bundle_bytes + settings.max_image_bytes) * BODY_OVERHEAD)

    class Guard(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
            length = request.headers.get("content-length")
            if length is not None and (not length.isdigit() or int(length) > body_limit):
                return _error(413, "too_large", "The request is too large")
            response = await call_next(request)
            response.headers["x-content-type-options"] = "nosniff"
            response.headers["referrer-policy"] = "no-referrer"
            response.headers["x-frame-options"] = "DENY"
            return response

    app.add_middleware(Guard)
    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["authorization", "content-type"],
        )

    @app.exception_handler(ServiceError)
    async def service_error(_request: Request, error: ServiceError) -> JSONResponse:
        return _error(error.status, error.code, error.message)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request: Request, error: RequestValidationError) -> JSONResponse:
        first = error.errors()[0] if error.errors() else {"loc": (), "msg": "Invalid request"}
        where = ".".join(str(part) for part in first.get("loc", ()) if part != "body")
        return _error(422, "invalid", f"{where}: {first.get('msg')}" if where else str(first.get("msg")))

    for router in (service.router, creations.router, comments.router, me.router, profiles.router, moderation.router):
        app.include_router(router)
    return app
