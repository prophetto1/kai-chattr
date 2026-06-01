from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_ok_with_db():
    with TestClient(app) as client:
        r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {
        "status": "ok",
        "service": "kai-chattr-api",
        "version": "0.0.0",
        "db": "ok",
    }
