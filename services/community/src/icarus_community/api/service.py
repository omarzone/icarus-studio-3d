from importlib.metadata import version

from fastapi import APIRouter, Request

from icarus_community.api.deps import ServicesDep
from icarus_community.auth import issue_dev_token
from icarus_community.errors import ServiceError
from icarus_community.schemas.service import API_VERSION, DevToken, DevTokenRequest, Health

router = APIRouter()


@router.get("/health")
def health(deps: ServicesDep) -> Health:
    return Health(
        status="ok", version=version("icarus-community"), api_version=API_VERSION, auth_mode=deps.settings.auth_mode
    )


@router.post("/v1/dev/token")
def dev_token(request: Request, deps: ServicesDep, body: DevTokenRequest) -> DevToken:
    """Local development sign-in: answers only when DEV_AUTH is on, which ENV=production refuses at start."""
    if not deps.settings.dev_auth or deps.settings.env == "production":
        raise ServiceError("not_found", "Development sign-in is off on this server")
    client = request.client.host if request.client else "unknown"
    if not deps.limiter.allow(f"dev-token:{client}"):
        raise ServiceError("rate_limited", "Too many sign-ins in a minute")
    token, lifetime = issue_dev_token(deps.settings, body.email, body.name)
    return DevToken(access_token=token, token_type="bearer", expires_in=lifetime)
