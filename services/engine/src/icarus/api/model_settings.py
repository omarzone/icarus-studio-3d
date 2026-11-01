from fastapi import APIRouter, Request

from icarus.contracts.copilot import Capability, ModelSettings, ModelSettingsPatch
from icarus.copilot.client import CopilotError, capability_client
from icarus.copilot.settings import CAPABILITIES, ModelSettingsStore

router = APIRouter(prefix="/settings/models")


def _settings(request: Request) -> ModelSettingsStore:
    return request.app.state.model_settings


@router.get("")
def get_model_settings(request: Request) -> ModelSettings:
    return _settings(request).settings()


@router.put("")
def update_model_settings(request: Request, body: ModelSettingsPatch) -> ModelSettings:
    return _settings(request).update(body)


@router.post("/test")
def test_model_settings(request: Request) -> ModelSettings:
    store = _settings(request)
    results: dict[Capability, str | None] = {}
    for capability in CAPABILITIES:
        client = capability_client(store, capability)
        if client is None:
            continue
        try:
            client.ping()
            results[capability] = None
        except CopilotError as error:
            results[capability] = str(error)
    return store.record_test(results)
