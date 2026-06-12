from __future__ import annotations

import conftest  # noqa: E402

import importlib
import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

TOKEN = "terminal-ws-token"


def _configure(tmp_dir: str):
    from app import main as app_module

    app_module = importlib.reload(app_module)
    cfg = {
        "server": {"port": 8840, "data_dir": tmp_dir},
        "frontend": {"dev_host": "127.0.0.1", "dev_port": 8800},
        "agents": {},
        "routing": {"default": "none", "max_agent_hops": 4},
        "images": {"upload_dir": str(Path(tmp_dir) / "uploads"), "max_size_mb": 10},
        "mcp": {"http_port": 8841, "sse_port": 8842},
    }
    app_module.configure(cfg, session_token=TOKEN)
    import conftest
    conftest.mint_test_session(app_module)

    return app_module


def _collect_output_until(ws, needle: str, timeout_s: float = 25.0) -> str:
    buffer = ""
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        frame = ws.receive_json()
        if frame.get("type") == "output":
            buffer += frame.get("data", "")
            if needle in buffer:
                return buffer
        elif frame.get("type") == "exit":
            break
    raise AssertionError(f"{needle!r} not seen in terminal output; got: {buffer[-500:]!r}")


def test_terminal_ws_ready_io_list_and_cleanup(tmp_path):
    app_module = _configure(str(tmp_path))
    client = TestClient(app_module.app)
    headers = conftest.session_headers()

    with client.websocket_connect(f"/ws/terminals?token={conftest.TEST_SESSION_TOKEN}") as ws:
        ready = ws.receive_json()
        assert ready["type"] == "ready"
        terminal_id = ready["terminal_id"]
        assert ready["shell"]
        assert ready["cols"] > 0 and ready["rows"] > 0

        listed = client.get("/api/terminals", headers=headers)
        assert listed.status_code == 200
        body = listed.json()
        assert body["ok"] is True
        assert [s["terminal_id"] for s in body["sessions"]] == [terminal_id]

        ws.send_text(json.dumps({"type": "resize", "cols": 120, "rows": 32}))
        ws.send_text(json.dumps({"type": "input", "data": "echo ws-ok\r"}))
        output = _collect_output_until(ws, "ws-ok")
        assert "ws-ok" in output

    # Disconnect kills the session — no orphans.
    deadline = time.time() + 10
    while time.time() < deadline:
        sessions = client.get("/api/terminals", headers=headers).json()["sessions"]
        if not sessions:
            break
        time.sleep(0.2)
    assert client.get("/api/terminals", headers=headers).json()["sessions"] == []


def test_terminal_ws_rejects_bad_token(tmp_path):
    app_module = _configure(str(tmp_path))
    client = TestClient(app_module.app)

    with pytest.raises(WebSocketDisconnect) as excinfo:
        with client.websocket_connect("/ws/terminals?token=wrong") as ws:
            ws.receive_json()
    assert excinfo.value.code == 4003


def test_terminal_runtime_events_emitted_and_schema_valid(tmp_path):
    from app.events.terminal_event_schema import validate_payload

    app_module = _configure(str(tmp_path))
    client = TestClient(app_module.app)

    with client.websocket_connect(f"/ws/terminals?token={conftest.TEST_SESSION_TOKEN}") as ws:
        ready = ws.receive_json()
        assert ready["type"] == "ready"

    # Teardown events flush after the server-side finally (reader join);
    # poll rather than racing it with a fixed sleep.
    events_file = Path(tmp_path) / "runtime_events.jsonl"
    by_type: dict[str, list[dict]] = {}
    deadline = time.time() + 15
    while time.time() < deadline:
        if events_file.exists():
            records = [
                json.loads(line)
                for line in events_file.read_text("utf-8").splitlines()
                if line
            ]
            by_type = {}
            for record in records:
                by_type.setdefault(record["event_type"], []).append(record)
            if "terminal.closed" in by_type:
                break
        time.sleep(0.3)
    assert events_file.exists(), "runtime events file missing"

    assert "terminal.opened" in by_type
    opened = by_type["terminal.opened"][-1]["details"]
    validate_payload("terminal.opened", opened)  # frozen schema fields only

    assert "terminal.closed" in by_type
    validate_payload("terminal.closed", by_type["terminal.closed"][-1]["details"])

    assert "terminal.bytes" in by_type
    for record in by_type["terminal.bytes"]:
        validate_payload("terminal.bytes", record["details"])
