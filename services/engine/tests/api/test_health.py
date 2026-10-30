from fastapi.testclient import TestClient

from icarus import __version__
from icarus.api.app import create_app


def test_health_reports_ok_and_version():
    response = TestClient(create_app()).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": __version__, "api_version": 1}
