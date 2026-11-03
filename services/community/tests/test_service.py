from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from icarus_community.api.app import create_app
from icarus_community.cli import migrate
from icarus_community.db import Base
from tests.conftest import make_settings


def test_health_says_how_people_sign_in(client):
    body = client.get("/health").json()

    assert (body["status"], body["api_version"], body["auth_mode"]) == ("ok", 1, "dev")


def test_migrations_build_exactly_the_tables_the_code_uses(settings):
    migrate(settings.database_url)
    engine = create_engine(settings.database_url)
    with engine.connect() as connection:
        differences = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    engine.dispose()

    assert differences == []


def test_writes_are_rate_limited_per_account(tmp_path, sign_in, prepared):
    settings = prepared(make_settings(tmp_path, writes_per_minute=2))
    with TestClient(create_app(settings)) as client:
        headers = sign_in("ana@example.test")
        statuses = [client.patch("/v1/me", json={"bio": str(n)}, headers=headers).status_code for n in range(3)]
        assert client.get("/v1/me", headers=headers).status_code == 200

    assert statuses == [200, 200, 429]


def test_oversized_requests_are_refused_before_they_are_read(client):
    response = client.post("/v1/creations", content=b"{}", headers={"content-length": str(50 * 1024 * 1024)})

    assert (response.status_code, response.json()["code"]) == (413, "too_large")


def test_cross_origin_requests_are_not_allowed_unless_configured(tmp_path, client, prepared):
    plain = client.get("/health", headers={"origin": "https://evil.test"})
    assert "access-control-allow-origin" not in plain.headers

    settings = prepared(make_settings(tmp_path, cors_origins=["https://icarus.test"]))
    with TestClient(create_app(settings)) as allowed:
        response = allowed.get("/health", headers={"origin": "https://icarus.test"})
    assert response.headers["access-control-allow-origin"] == "https://icarus.test"


def test_categories_come_from_the_migration(client):
    assert [category["name"] for category in client.get("/v1/categories").json()] == [
        "Cars",
        "Robots",
        "Humanoids",
        "Insects",
        "Worlds",
        "Brains only",
    ]
