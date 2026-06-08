import importlib
import sys
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _make_client():
    from app import main as app_module

    app_module = importlib.reload(app_module)
    tmp = tempfile.TemporaryDirectory()
    data_dir = Path(tmp.name)
    cfg = {
        "server": {
            "port": 8840,
            "data_dir": str(data_dir),
            "remote_agent_token": "remote-test-token",
        },
        "frontend": {"dev_host": "127.0.0.1", "dev_port": 8800},
        "agents": {},
        "routing": {"default": "none", "max_agent_hops": 4},
        "images": {"upload_dir": str(data_dir / "uploads"), "max_size_mb": 10},
        "mcp": {"http_port": 8841, "sse_port": 8842},
    }
    app_module.configure(cfg, session_token="home-test-token")
    client = TestClient(app_module.app)
    return client, tmp


def _headers():
    return {"X-Session-Token": "home-test-token"}


def test_home_start_endpoints_return_typed_empty_states():
    client, tmp = _make_client()
    try:
        assert client.get("/api/repositories", headers=_headers()).json() == {
            "items": [],
            "next_page_id": None,
        }
        assert client.get(
            "/api/repositories/search?query=kai",
            headers=_headers(),
        ).json() == {"items": [], "next_page_id": None}
        assert client.get(
            "/api/repositories/propreheto/kai-chattr/branches",
            headers=_headers(),
        ).json() == {"items": [], "next_page_id": None}
        assert client.get("/api/suggested-tasks", headers=_headers()).json() == {
            "items": [],
            "next_page_id": None,
        }
        assert client.get("/api/conversations/recent", headers=_headers()).json() == {
            "items": [],
            "next_page_id": None,
        }
    finally:
        client.close()
        tmp.cleanup()


def test_create_conversation_persists_to_recent_conversations():
    client, tmp = _make_client()
    try:
        response = client.post(
            "/api/conversations",
            json={
                "repository": {
                    "name": "propreheto/kai-chattr",
                    "branch": "main",
                    "gitProvider": "github",
                }
            },
            headers=_headers(),
        )

        assert response.status_code == 200
        created = response.json()
        assert created["conversation_id"]
        assert created["status"] == "ready"
        assert created["url"] == f"/workbench?conversation_id={created['conversation_id']}"
        assert created["conversation"]["selected_repository"] == "propreheto/kai-chattr"
        assert created["conversation"]["selected_branch"] == "main"

        recent = client.get("/api/conversations/recent", headers=_headers()).json()
        assert [item["id"] for item in recent["items"]] == [created["conversation_id"]]
    finally:
        client.close()
        tmp.cleanup()


def test_home_start_sqlalchemy_store_and_migration_exist(tmp_path):
    from app.stores.factory import create_home_start_store
    from app.stores.home_start_db import SqlAlchemyHomeStartStore

    migration_dir = ROOT / "migrations" / "versions"
    assert any(path.name.endswith("_create_home_start_tables.py") for path in migration_dir.iterdir())

    store = create_home_start_store(
        {
            "database": {
                "mode": "postgres",
                "url": f"sqlite:///{tmp_path / 'home-start.db'}",
            }
        },
        str(tmp_path / "home-start.json"),
    )

    assert isinstance(store, SqlAlchemyHomeStartStore)
    created = store.create_conversation(
        repository={
            "name": "propreheto/kai-chattr",
            "branch": "main",
            "gitProvider": "github",
        }
    )
    assert created["selected_repository"] == "propreheto/kai-chattr"
    assert store.list_recent_conversations()["items"][0]["id"] == created["id"]
