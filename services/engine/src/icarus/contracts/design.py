from typing import Literal

from pydantic import BaseModel, ConfigDict


class DesignCheck(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Literal["structure", "compiles", "reachable", "settles", "actuators", "sensors"]
    label: str
    status: Literal["pass", "fail", "skip"]
    detail: str


class DesignReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ok: bool
    checks: list[DesignCheck]
    duration_ms: float
