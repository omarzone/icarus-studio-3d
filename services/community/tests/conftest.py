import base64
import shutil
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url

from icarus_community.api.app import create_app
from icarus_community.auth import issue_dev_token
from icarus_community.cli import migrate
from icarus_community.settings import Settings

# The smallest valid PNG: a 1×1 transparent pixel.
PNG = base64.b64encode(
    bytes.fromhex(
        "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
        "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082"
    )
).decode()

Headers = dict[str, str]


def make_settings(tmp_path: Path, **overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "env": "test",
        "dev_auth": True,
        "database_url": f"sqlite:///{(tmp_path / 'community.db').as_posix()}",
        "files_dir": tmp_path / "files",
        "moderator_emails": ["mod@example.test"],
        "writes_per_minute": 1000,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


def project_bundle(name: str = "Parking car", remix_of: str | None = None) -> dict[str, Any]:
    return {
        "format": "icarus.bundle",
        "format_version": 1,
        "kind": "project",
        "contract_version": "1",
        "library_version": "2026.11",
        "created_with": "Icarus Studio 3D",
        "lineage": {"remix_of": remix_of},
        "project": {
            "id": "proj-1",
            "name": name,
            "description": "A car that parks",
            "schema_version": 1,
            "world": {"objects": [{"id": "ground", "components": {"physics": {"friction": 0.8}}}]},
            "bodies": [{"id": "car", "parts": []}],
            "task": {"family": "navigation", "rewards": []},
            "brain": {"algorithm": "ppo"},
            "agents": [],
        },
    }


@pytest.fixture(scope="session")
def database_template(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """Migrations run once; each test starts from a copy of the migrated database."""
    path = tmp_path_factory.mktemp("template") / "community.db"
    migrate(f"sqlite:///{path.as_posix()}")
    return path


@pytest.fixture
def prepared(database_template: Path) -> Callable[[Settings], Settings]:
    def copy(settings: Settings) -> Settings:
        target = make_url(settings.database_url).database
        assert target is not None
        shutil.copyfile(database_template, target)
        return settings

    return copy


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return make_settings(tmp_path)


@pytest.fixture
def client(settings: Settings, prepared: Callable[[Settings], Settings]) -> Iterator[TestClient]:
    with TestClient(create_app(prepared(settings))) as test_client:
        yield test_client


@pytest.fixture
def sign_in(settings: Settings) -> Callable[[str], Headers]:
    def headers(email: str) -> Headers:
        token, _ = issue_dev_token(settings, email, email.split("@")[0].capitalize())
        return {"authorization": f"Bearer {token}"}

    return headers


@pytest.fixture
def publish(client: TestClient) -> Callable[..., dict[str, Any]]:
    """Publishes a project for whoever `headers` signs in, ready with a title, category and guidelines."""

    def run(
        headers: Headers,
        project_id: str = "proj-1",
        title: str = "Parking car",
        remix_of: str | None = None,
        **page: Any,
    ) -> dict[str, Any]:
        patch = {"title": title, "category": "cars", "guidelines_accepted": True, **page}
        assert client.patch(f"/v1/me/pages/{project_id}", json=patch, headers=headers).status_code == 200
        body = {
            "project_id": project_id,
            "bundle": project_bundle(title, remix_of),
            "thumbnail": PNG,
            "included": ["World · a parking lot"],
        }
        response = client.post("/v1/creations", json=body, headers=headers)
        assert response.status_code == 201, response.text
        return response.json()

    return run
