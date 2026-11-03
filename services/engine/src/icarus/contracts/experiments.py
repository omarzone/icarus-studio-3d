from pydantic import BaseModel, ConfigDict, Field

from icarus.contracts.training import LiveViewMode


class Experiments(BaseModel):
    """Behaviors still being compared before one becomes the default, read from experiments.json in the settings
    folder. Every switch has a default, used when the file, the key or its value is missing or invalid."""

    model_config = ConfigDict(extra="forbid")

    live_view: LiveViewMode = "realtime"
    # Share of the task's recommended steps a brain trains before the coach may call it stalled or change its design
    # for slow progress; a design problem found by a look or a design test still stops a run at once.
    coach_patience: float = Field(default=0.5, ge=0.1, le=1.0)
