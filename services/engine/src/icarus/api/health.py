from fastapi import APIRouter

from icarus import __version__
from icarus.contracts import HealthStatus

API_VERSION = 1

router = APIRouter()


@router.get("/health")
def health() -> HealthStatus:
    return HealthStatus(status="ok", version=__version__, api_version=API_VERSION)
