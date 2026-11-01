from fastapi.testclient import TestClient

from icarus.api.app import create_app


def test_library_lists_the_motor_with_its_force_schema(tmp_path):
    catalog = TestClient(create_app(tmp_path)).get("/library").json()
    motor = next(kind for kind in catalog["components"] if kind["kind"] == "motor")
    force = next(prop for prop in motor["properties"] if prop["id"] == "max_force")
    assert (force["type"], force["unit"], force["max"]) == ("number", "N", 10000)
