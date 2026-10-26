from fastapi.testclient import TestClient

from src.main import create_app


def test_health_ok():
    client = TestClient(create_app())
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["ok"] is True
    assert body["service"] == "yoyo-sauce"
