"""Phase 0 auth unification (plan v2) — Task 0: local owner bootstrap.

POST /auth/local-session mints the local owner's session: loopback-only,
local-runtime-mode-only, AuthSession response shape identical to
signup/login, idempotent owner/workspace ensure (workspace public_id
config-default 'local'). Task 1 adds the middleware-flip cases here.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402


def _app(*, with_store: bool = True, runtime_mode: str | None = None):
    from app.routes.auth import router
    from app.stores.identity_db import SqlAlchemyIdentityStore

    app = FastAPI()
    if with_store:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            future=True,
        )
        app.state.identity_store = SqlAlchemyIdentityStore(engine)
    if runtime_mode is not None:
        app.state.runtime_mode = runtime_mode
    app.include_router(router)
    return app


def test_local_session_mints_owner_session_idempotently():
    app = _app()
    client = TestClient(app)

    first = client.post("/auth/local-session", json={})
    assert first.status_code == 200
    body = first.json()
    assert body["token"].startswith("kcs_")
    assert body["expires_at"]
    assert body["user"]["email"]
    assert body["workspace"]["public_id"] == "local"

    second = client.post("/auth/local-session", json={})
    assert second.status_code == 200
    again = second.json()
    # Same owner identity, fresh session token.
    assert again["user"]["id"] == body["user"]["id"]
    assert again["workspace"]["public_id"] == "local"
    assert again["token"] != body["token"]

    # Exactly one owner user / one local workspace exist server-side.
    store = app.state.identity_store
    ws = store.get_workspace_by_public_id("local")
    assert ws is not None
    membership = store.get_membership(workspace_id=ws["id"], user_id=body["user"]["id"])
    assert membership is not None and membership["role"] == "owner"


def test_local_session_rejects_non_loopback_clients():
    app = _app()
    client = TestClient(app, client=("203.0.113.9", 4444))
    response = client.post("/auth/local-session", json={})
    assert response.status_code == 403


def test_local_session_rejects_cloud_runtime_mode():
    app = _app(runtime_mode="cloud")
    client = TestClient(app)
    response = client.post("/auth/local-session", json={})
    assert response.status_code == 403


def test_local_session_503_without_identity_store():
    app = _app(with_store=False)
    client = TestClient(app)
    response = client.post("/auth/local-session", json={})
    assert response.status_code == 503


# --- Task 1: middleware flip — auth_sessions is the single user authority ---

import importlib
import tempfile


def _configured_app_with_identity():
    from app import main as app_module

    app_module = importlib.reload(app_module)
    tmp = tempfile.TemporaryDirectory()
    cfg = {
        "server": {"port": 8840, "data_dir": tmp.name, "remote_agent_token": "remote-test-token"},
        "agents": {"codex": {"command": "codex", "cwd": ".", "label": "Codex"}},
        "routing": {"default": "none", "max_agent_hops": 4},
        "images": {"upload_dir": str(Path(tmp.name) / "uploads"), "max_size_mb": 10},
        "mcp": {"http_port": 8841, "sse_port": 8842},
    }
    app_module.configure(cfg, session_token="legacy-launcher-token")

    from sqlalchemy import create_engine
    from sqlalchemy.pool import StaticPool

    from app.stores.identity_db import SqlAlchemyIdentityStore

    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool, future=True
    )
    app_module.app.state.identity_store = SqlAlchemyIdentityStore(engine)
    client = TestClient(app_module.app)
    token = client.post("/auth/local-session", json={}).json()["token"]
    return app_module, client, token, tmp


def test_flipped_routes_reject_launcher_token_and_accept_kcs():
    app_module, client, token, _tmp = _configured_app_with_identity()

    legacy = client.get("/api/jobs", headers={"X-Session-Token": "legacy-launcher-token"})
    assert legacy.status_code == 401

    via_legacy_header = client.get("/api/jobs", headers={"X-Session-Token": token})
    assert via_legacy_header.status_code == 200

    via_bearer = client.get("/api/jobs", headers={"Authorization": f"Bearer {token}"})
    assert via_bearer.status_code == 200

    missing = client.get("/api/jobs")
    assert missing.status_code == 401


def test_expired_session_rejected():
    app_module, client, token, _tmp = _configured_app_with_identity()
    store = app_module.app.state.identity_store
    user = store.find_user_by_email("owner@local.kai")
    expired = store.issue_session(user_id=user["id"], ttl_seconds=-60)
    response = client.get("/api/jobs", headers={"X-Session-Token": expired["token"]})
    assert response.status_code == 401


def test_agent_bearer_lane_unaffected_by_flip():
    app_module, client, token, _tmp = _configured_app_with_identity()
    reg = client.post(
        "/api/register",
        json={"base": "codex"},
        headers={"X-Agentchattr-Remote-Token": "remote-test-token"},
    )
    assert reg.status_code == 200
    agent_token = reg.json()["token"]
    posted = client.post(
        "/api/terminal/codex",
        json={"text": "agent screen"},
        headers={"Authorization": f"Bearer {agent_token}"},
    )
    assert posted.status_code == 200
