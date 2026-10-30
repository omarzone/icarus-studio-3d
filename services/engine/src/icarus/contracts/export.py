import json
import sys
from pathlib import Path
from typing import Any

from pydantic.json_schema import models_json_schema

from icarus.contracts import MODELS


def build_schema() -> dict[str, Any]:
    _, schema = models_json_schema([(model, "serialization") for model in MODELS], ref_template="#/$defs/{model}")
    return {"$schema": "https://json-schema.org/draft/2020-12/schema", "title": "IcarusContracts", **schema}


def main() -> None:
    Path(sys.argv[1]).write_text(json.dumps(build_schema(), indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
