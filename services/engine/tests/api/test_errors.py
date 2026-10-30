from fastapi.testclient import TestClient

from icarus.api.app import create_app


def test_unknown_route_returns_api_error():
    response = TestClient(create_app()).get("/nope")
    assert response.status_code == 404
    assert response.json() == {"code": "not_found", "message": "No route for GET /nope", "details": None}
