from icarus.contracts.copilot import ModelSettingsPatch
from icarus.copilot.settings import ModelSettingsStore

KEY = "sk-test-0123456789abcd"


def patch(**fields) -> ModelSettingsPatch:
    return ModelSettingsPatch.model_validate(fields)


def test_the_key_is_stored_but_never_returned(tmp_path):
    store = ModelSettingsStore(tmp_path)
    settings = store.update(patch(endpoint="https://models.example/v1", api_key=KEY, models={"reasoning": "big-model"}))
    assert KEY not in settings.model_dump_json()
    assert settings.api_key_hint == "abcd"
    assert KEY in (tmp_path / "models.json").read_text(encoding="utf-8")
    connection = ModelSettingsStore(tmp_path).connection("reasoning")
    assert connection is not None and connection.api_key == KEY and connection.model == "big-model"


def test_reasoning_is_required_and_untested_models_are_not_connected(tmp_path, monkeypatch):
    monkeypatch.setenv("ICARUS_COPILOT_PROVIDER", "")
    store = ModelSettingsStore(tmp_path)
    connections = {item.capability: item for item in store.settings().connections}
    assert connections["reasoning"].required and not connections["vision"].required
    assert not connections["reasoning"].connected and connections["reasoning"].model is None
    store.update(patch(endpoint="https://models.example/v1", api_key=KEY, models={"reasoning": "big-model"}))
    reasoning = next(item for item in store.settings().connections if item.capability == "reasoning")
    assert reasoning.model == "big-model" and not reasoning.connected and reasoning.detail


def test_a_passed_test_connects_until_the_endpoint_changes(tmp_path, monkeypatch):
    monkeypatch.setenv("ICARUS_COPILOT_PROVIDER", "")
    store = ModelSettingsStore(tmp_path)
    store.update(patch(endpoint="https://models.example/v1", api_key=KEY, models={"reasoning": "big-model"}))
    store.record_test({"reasoning": None})
    assert next(item for item in store.settings().connections if item.capability == "reasoning").connected
    store.update(patch(endpoint="https://other.example/v1"))
    assert not next(item for item in store.settings().connections if item.capability == "reasoning").connected


def test_environment_variables_fill_what_was_never_saved(tmp_path, monkeypatch):
    monkeypatch.setenv("ICARUS_MODEL_ENDPOINT", "https://env.example/v1")
    monkeypatch.setenv("ICARUS_MODEL_API_KEY", KEY)
    monkeypatch.setenv("ICARUS_MODEL_REASONING", "env-model")
    store = ModelSettingsStore(tmp_path)
    connection = store.connection("reasoning")
    assert connection is not None and connection.endpoint == "https://env.example/v1"
    assert connection.model == "env-model"
    assert store.connection("vision") is None
