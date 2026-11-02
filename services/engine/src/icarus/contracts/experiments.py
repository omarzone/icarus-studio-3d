from pydantic import BaseModel, ConfigDict

from icarus.contracts.training import LiveViewMode


class Experiments(BaseModel):
    """Behaviors still being compared before one becomes the default, read from experiments.json in the settings
    folder. Every switch has a default, used when the file, the key or its value is missing or invalid."""

    model_config = ConfigDict(extra="forbid")

    live_view: LiveViewMode = "realtime"
