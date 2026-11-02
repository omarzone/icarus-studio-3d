import json
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from icarus.contracts.experiments import Experiments
from icarus.copilot.settings import settings_dir

EXPERIMENTS_FILE = "experiments.json"


def read_experiments(folder: Path | None = None) -> Experiments:
    """The experiment switches in the settings folder; a missing file, key or invalid value keeps its default."""
    path = (folder or settings_dir()) / EXPERIMENTS_FILE
    try:
        raw: Any = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return Experiments()
    if not isinstance(raw, dict):
        return Experiments()
    valid: dict[str, Any] = {}
    for key in Experiments.model_fields:
        if key not in raw:
            continue
        try:
            Experiments.model_validate({key: raw[key]})
        except ValidationError:
            continue
        valid[key] = raw[key]
    return Experiments.model_validate(valid)
