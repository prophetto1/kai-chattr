"""Phase 0 auth unification (plan v2) — Task 2: websockets validate auth sessions.

Both /ws (room) and /ws/terminals reject the legacy launcher token with
close code 4003 and accept a minted kcs_ session token.
"""

from __future__ import annotations

import importlib
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import conftest  # noqa: E402
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from starlette.websockets import WebSocketDisconnect  # noqa: E402

LAUNCHER_TOKEN = "ws-launcher-token"


def _configured():
    from app import main as app_module

    app_module = importlib.reload(app_module)
    tmp = tempfile.TemporaryDirectory()
    cfg = {
        "server": {"port": 8840, "data_dir": tmp.name},
        "agents": {},
        "routing": {"default": "none", "max_agent_hops": 4},
        "images": {"upload_dir": str(Path(tmp.name) / "uploads"), "max_size_mb": 10},
        "mcp": {"http_port": 8841, "sse_port": 8842},
    }
    app_module.configure(cfg, session_token=LAUNCHER_TOKEN)
    kcs = conftest.mint_test_session(app_module)
    return app_module, TestClient(app_module.app), kcs, tmp


def _expect_4003(client: TestClient, url: str) -> None:
    with pytest.raises(WebSocketDisconnect) as excinfo:
        with client.websocket_connect(url) as ws:
            ws.receive_json()
    assert excinfo.value.code == 4003


def test_room_ws_rejects_launcher_token():
    _app, client, _kcs, _tmp = _configured()
    _expect_4003(client, f"/ws?token={LAUNCHER_TOKEN}")


def test_room_ws_accepts_kcs_session():
    _app, client, kcs, _tmp = _configured()
    with client.websocket_connect(f"/ws?token={kcs}") as ws:
        frame = ws.receive_json()
    assert isinstance(frame, dict) and frame.get("type")


def test_terminal_ws_rejects_launcher_token():
    _app, client, _kcs, _tmp = _configured()
    _expect_4003(client, f"/ws/terminals?token={LAUNCHER_TOKEN}")


def test_terminal_ws_accepts_kcs_session():
    _app, client, kcs, _tmp = _configured()
    with client.websocket_connect(f"/ws/terminals?token={kcs}") as ws:
        ready = ws.receive_json()
    assert ready.get("type") == "ready"
