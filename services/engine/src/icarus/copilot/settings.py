import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import get_args

from pydantic import BaseModel, ConfigDict, ValidationError

from icarus.contracts.copilot import Capability, ModelConnection, ModelSettings, ModelSettingsPatch
from icarus.projects.files import write_atomic

SETTINGS_DIR_ENV = "ICARUS_SETTINGS_DIR"
PROVIDER_ENV = "ICARUS_COPILOT_PROVIDER"
ENDPOINT_ENV = "ICARUS_MODEL_ENDPOINT"
API_KEY_ENV = "ICARUS_MODEL_API_KEY"
SETTINGS_FILE = "models.json"
CAPABILITIES: tuple[Capability, ...] = get_args(Capability)
REQUIRED: frozenset[Capability] = frozenset({"reasoning"})
HINT_LENGTH = 4
# Shorter keys show no hint, so the hint never gives away a large part of the key.
MIN_KEY_FOR_HINT = 8


def settings_dir() -> Path:
    configured = os.environ.get(SETTINGS_DIR_ENV)
    return Path(configured) if configured else Path.home() / ".icarus"


def answers_from_fixtures() -> bool:
    return os.environ.get(PROVIDER_ENV, "").strip().lower() == "fake"


@dataclass(frozen=True)
class Connection:
    endpoint: str
    api_key: str
    model: str


class _Stored(BaseModel):
    model_config = ConfigDict(extra="forbid")

    endpoint: str = ""
    api_key: str = ""
    models: dict[Capability, str] = {}
    # Model names that answered a connection test with the current endpoint and key.
    verified: dict[Capability, str] = {}
    # The model's context window in tokens, when it is known; the copilot assumes a conservative one otherwise.
    context_tokens: dict[Capability, int] = {}


class ModelSettingsStore:
    """One OpenAI-compatible endpoint and key, and a model per capability, kept outside the repo."""

    def __init__(self, root: Path) -> None:
        self._path = root / SETTINGS_FILE
        self._lock = threading.Lock()
        self._failures: dict[Capability, str] = {}
        # Learned while running and kept until the settings change: windows a service proved smaller, and
        # capabilities whose service refuses native tools.
        self._learned_window: dict[Capability, int] = {}
        self._no_tools: set[Capability] = set()

    def _stored(self) -> _Stored:
        if not self._path.is_file():
            return _Stored()
        try:
            return _Stored.model_validate_json(self._path.read_text(encoding="utf-8"))
        except (OSError, ValidationError):
            return _Stored()

    def _save(self, stored: _Stored) -> None:
        write_atomic(self._path, stored.model_dump_json(indent=2))
        if os.name != "nt":
            self._path.chmod(0o600)

    def _endpoint(self, stored: _Stored) -> str:
        return (stored.endpoint or os.environ.get(ENDPOINT_ENV, "")).strip().rstrip("/")

    def _key(self, stored: _Stored) -> str:
        if stored.api_key:
            return stored.api_key
        # The environment key belongs to the environment endpoint and is never sent to another host.
        env_endpoint = os.environ.get(ENDPOINT_ENV, "").strip().rstrip("/")
        return os.environ.get(API_KEY_ENV, "") if env_endpoint and self._endpoint(stored) == env_endpoint else ""

    def _model(self, stored: _Stored, capability: Capability) -> str | None:
        return stored.models.get(capability) or os.environ.get(f"ICARUS_MODEL_{capability.upper()}") or None

    def connection(self, capability: Capability) -> Connection | None:
        stored = self._stored()
        endpoint, model = self._endpoint(stored), self._model(stored, capability)
        if not endpoint or not model:
            return None
        return Connection(endpoint, self._key(stored), model)

    def _status(self, stored: _Stored, capability: Capability) -> ModelConnection:
        model = self._model(stored, capability)
        connected, detail = False, None
        if capability in REQUIRED and answers_from_fixtures():
            connected = True
        elif model is None:
            detail = "No model is set"
        elif not self._endpoint(stored):
            detail = "Set the endpoint and key first"
        elif capability in self._failures:
            detail = self._failures[capability]
        elif stored.verified.get(capability) == model:
            connected = True
        else:
            detail = "Not tested yet"
        return ModelConnection(
            capability=capability, model=model, required=capability in REQUIRED, connected=connected, detail=detail
        )

    def settings(self) -> ModelSettings:
        stored = self._stored()
        key = self._key(stored)
        return ModelSettings(
            endpoint=self._endpoint(stored),
            api_key_hint=key[-HINT_LENGTH:] if len(key) >= MIN_KEY_FOR_HINT else "",
            connections=[self._status(stored, capability) for capability in CAPABILITIES],
        )

    def update(self, patch: ModelSettingsPatch) -> ModelSettings:
        with self._lock:
            stored = self._stored()
            if patch.endpoint is not None and patch.endpoint.strip() != stored.endpoint:
                stored.endpoint = patch.endpoint.strip()
                stored.verified = {}
                if patch.api_key is None:
                    stored.api_key = ""
            if patch.api_key is not None and patch.api_key.strip() != stored.api_key:
                stored.api_key = patch.api_key.strip()
                stored.verified = {}
            for capability, model in (patch.models or {}).items():
                if model.strip():
                    stored.models[capability] = model.strip()
                else:
                    stored.models.pop(capability, None)
            self._failures = {}
            self._learned_window = {}
            self._no_tools = set()
            self._save(stored)
        return self.settings()

    def context_tokens(self, capability: Capability) -> int | None:
        """The smallest window known for a capability: the saved one or one learned from a refused request."""
        known = [self._stored().context_tokens.get(capability), self._learned_window.get(capability)]
        windows = [window for window in known if window]
        return min(windows) if windows else None

    def learn_context(self, capability: Capability, tokens: int) -> None:
        with self._lock:
            current = self._learned_window.get(capability)
            self._learned_window[capability] = tokens if current is None else min(current, tokens)

    def refuses_tools(self, capability: Capability) -> bool:
        return capability in self._no_tools

    def record_tools_refused(self, capability: Capability) -> None:
        with self._lock:
            self._no_tools.add(capability)

    def record_test(self, results: dict[Capability, str | None]) -> ModelSettings:
        """Remember which capabilities answered a test call; a result is None when it answered, else why not."""
        with self._lock:
            stored = self._stored()
            for capability, failure in results.items():
                model = self._model(stored, capability)
                if failure is None and model is not None:
                    stored.verified[capability] = model
                    self._failures.pop(capability, None)
                else:
                    stored.verified.pop(capability, None)
                    self._failures[capability] = failure or "No model is set"
            self._save(stored)
        return self.settings()
