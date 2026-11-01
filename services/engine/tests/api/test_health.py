from fastapi.testclient import TestClient

from icarus import __version__
from icarus.api.app import create_app


def test_health_reports_ok_and_version():
    response = TestClient(create_app()).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__, "api_version": 1}


def test_the_app_window_may_call_the_engine_from_the_dev_server_and_from_files():
    client = TestClient(create_app())
    for origin in ("http://localhost:5173", "null"):
        response = client.options(
            "/projects",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin


def test_other_websites_may_not_call_the_engine():
    response = TestClient(create_app()).get("/health", headers={"Origin": "https://example.com"})
    assert "access-control-allow-origin" not in response.headers
