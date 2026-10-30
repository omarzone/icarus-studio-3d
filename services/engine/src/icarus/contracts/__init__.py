from pydantic import BaseModel

from icarus.contracts.errors import ApiError
from icarus.contracts.health import HealthStatus

MODELS: tuple[type[BaseModel], ...] = (HealthStatus, ApiError)

__all__ = ["MODELS", "ApiError", "HealthStatus"]
