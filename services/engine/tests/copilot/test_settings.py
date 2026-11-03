import os
import stat

import pytest
from pydantic import ValidationError

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


def test_a_new_endpoint_without_a_new_key_forgets_the_old_key(tmp_path):
    store = ModelSettingsStore(tmp_path)
    store.update(patch(endpoint="https://models.example/v1", api_key=KEY, models={"reasoning": "big-model"}))
    settings = store.update(patch(endpoint="https://other.example/v1"))
    assert settings.api_key_hint == ""
    connection = store.connection("reasoning")
    assert connection is not None and connection.api_key == ""
    assert KEY not in (tmp_path / "models.json").read_text(encoding="utf-8")
    store.update(patch(endpoint="https://third.example/v1", api_key="sk-new-key-12345678"))
    connection = store.connection("reasoning")
    assert connection is not None and connection.api_key == "sk-new-key-12345678"


def test_the_environment_key_only_goes_to_the_environment_endpoint(tmp_path, monkeypatch):
    monkeypatch.setenv("ICARUS_MODEL_ENDPOINT", "https://env.example/v1")
    monkeypatch.setenv("ICARUS_MODEL_API_KEY", KEY)
    store = ModelSettingsStore(tmp_path)
    store.update(patch(endpoint="https://user.example/v1", models={"reasoning": "big-model"}))
    connection = store.connection("reasoning")
    assert connection is not None and connection.endpoint == "https://user.example/v1" and connection.api_key == ""
    assert store.settings().api_key_hint == ""


@pytest.mark.skipif(os.name == "nt", reason="POSIX file permissions")
def test_the_settings_file_is_readable_only_by_its_owner(tmp_path):
    ModelSettingsStore(tmp_path).update(patch(endpoint="https://models.example/v1", api_key=KEY))
    assert stat.S_IMODE((tmp_path / "models.json").stat().st_mode) == 0o600


def test_a_set_context_window_is_kept_shown_and_cleared_without_touching_the_rest(tmp_path):
    store = ModelSettingsStore(tmp_path)
    store.update(patch(endpoint="https://models.example/v1", api_key=KEY, models={"reasoning": "big-model"}))
    assert store.context_tokens("reasoning") is None and store.context_source("reasoning") == "assumed"
    settings = store.update(patch(context_tokens={"reasoning": 1_000_000}))
    connections = {item.capability: item for item in settings.connections}
    assert connections["reasoning"].context_tokens == 1_000_000 and connections["vision"].context_tokens is None
    reopened = ModelSettingsStore(tmp_path)
    assert reopened.context_tokens("reasoning") == 1_000_000 and reopened.context_source("reasoning") == "set"
    assert reopened.connection("reasoning") == store.connection("reasoning")
    reopened.update(patch(context_tokens={"reasoning": None}))
    assert reopened.context_tokens("reasoning") is None and reopened.context_source("reasoning") == "assumed"


def test_a_refused_request_below_the_set_window_wins_and_says_it_was_learned(tmp_path):
    store = ModelSettingsStore(tmp_path)
    store.update(patch(context_tokens={"reasoning": 1_000_000}))
    store.learn_context("reasoning", 200_000)
    assert store.context_tokens("reasoning") == 200_000 and store.context_source("reasoning") == "learned"


@pytest.mark.parametrize("tokens", [0, 3_999, 10_000_001, -5])
def test_a_context_window_out_of_range_is_refused(tokens):
    with pytest.raises(ValidationError):
        patch(context_tokens={"reasoning": tokens})
