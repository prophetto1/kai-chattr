"""Shared test helpers for chattr unittest classes.

Used by tests that need to configure() the chattr FastAPI app. FastAPI
allows `add_middleware` only before the app has started; once a TestClient
makes its first request, the middleware stack is locked. So when multiple
test classes (or multiple test files) each call `app.configure()`, only
the first call succeeds. Subsequent calls in the same pytest process hit:

    RuntimeError: Cannot add middleware after an application has started

`chattr_test_configure` handles both first-call and subsequent-call cases:

- First call: full `app.configure(cfg, session_token=...)` (installs middleware).
- Subsequent calls: re-plumb the runtime event stream and session token holder
  to the new tmpdir without touching middleware.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app import main as app
from app.runtime_contract import (
    DEFAULT_API_PORT,
    DEFAULT_FRONTEND_PORT,
    DEFAULT_MCP_HTTP_PORT,
    DEFAULT_MCP_SSE_PORT,
)


def chattr_test_configure(
    data_dir: str | Path,
    session_token: str = "ui-test-token",
    *,
    extra_cfg: dict[str, Any] | None = None,
) -> str:
    """Configure (or re-plumb) chattr's app for a test class.

    Returns the configured session token for convenience.
    """
    data_dir_str = str(data_dir)
    cfg: dict[str, Any] = {
        "server": {
            "port": DEFAULT_API_PORT,
            "data_dir": data_dir_str,
            "remote_agent_token": "remote-test-token",
        },
        "frontend": {"dev_host": "127.0.0.1", "dev_port": DEFAULT_FRONTEND_PORT},
        "agents": {},
        "routing": {"default": "none", "max_agent_hops": 4},
        "images": {
            "upload_dir": str(Path(data_dir_str) / "uploads"),
            "max_size_mb": 10,
        },
        "mcp": {"http_port": DEFAULT_MCP_HTTP_PORT, "sse_port": DEFAULT_MCP_SSE_PORT},
    }
    if extra_cfg:
        # Shallow merge â€” callers can override or extend top-level cfg keys.
        cfg.update(extra_cfg)

    if app.app.middleware_stack is None:
        app.configure(cfg, session_token=session_token)
    else:
        # Already configured by a prior test class. Re-plumb runtime substrate
        # to the new data_dir without re-installing middleware.
        from app.events import JsonlEventStream, RUNTIME_EVENT_SCHEMA_VERSION
        from app.observability import set_export_paths

        data_dir_path = Path(data_dir_str)
        data_dir_path.mkdir(parents=True, exist_ok=True)
        app.config = cfg
        app.session_token = session_token
        app._session_token_holder[0] = session_token
        app.runtime_event_stream = JsonlEventStream(
            data_dir_path / "runtime_events.jsonl",
            schema_version=RUNTIME_EVENT_SCHEMA_VERSION,
        )
        # OTel providers were installed on the first configure() and cannot
        # be reinstalled; only re-point the JSON-lines exporter file paths.
        set_export_paths(data_dir_path)
    from app import main as _app_module
    return mint_test_session(_app_module)


# --- Phase 0 auth unification: tests authenticate with real auth sessions ---
TEST_SESSION_TOKEN: str = ""


def mint_test_session(app_module) -> str:
    """Attach an in-memory identity store (if absent) and mint the local
    owner's kcs_ session via /auth/local-session. The launcher token is no
    longer a product credential (plan v2 Task 1)."""
    global TEST_SESSION_TOKEN
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.pool import StaticPool

    from app.stores.identity_db import SqlAlchemyIdentityStore

    if getattr(app_module.app.state, "identity_store", None) is None:
        engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
            future=True,
        )
        app_module.app.state.identity_store = SqlAlchemyIdentityStore(engine)
    client = TestClient(app_module.app)  # no context manager: do not run app lifespan here
    response = client.post("/auth/local-session", json={})
    assert response.status_code == 200, f"local-session bootstrap failed: {response.status_code} {response.text}"
    TEST_SESSION_TOKEN = response.json()["token"]
    return TEST_SESSION_TOKEN


def session_headers() -> dict:
    return {"X-Session-Token": TEST_SESSION_TOKEN}
