import importlib
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

_CLIENTS = []
_TEMPDIRS = []


def session_headers(token: str = "settings-test-token"):
    return {"X-Session-Token": token}


@pytest.fixture(autouse=True)
def reset_app_after_test():
    yield
    while _CLIENTS:
        _CLIENTS.pop().close()
    while _TEMPDIRS:
        _TEMPDIRS.pop().cleanup()
    from app import main as app_module

    importlib.reload(app_module)


def make_client(client=("127.0.0.1", 50000)):
    from app import main as app_module

    app_module = importlib.reload(app_module)
    tmp = tempfile.TemporaryDirectory()
    _TEMPDIRS.append(tmp)
    data_dir = Path(tmp.name)
    cfg = {
        "server": {
            "port": 8300,
            "data_dir": str(data_dir),
            "remote_agent_token": "remote-test-token",
        },
        "agents": {
            "minimax": {
                "type": "api",
                "base_url": "https://api.minimax.io/v1",
                "model": "MiniMax-M2.7",
            }
        },
        "routing": {"default": "none", "max_agent_hops": 4},
        "images": {"upload_dir": str(data_dir / "uploads"), "max_size_mb": 10},
        "mcp": {"http_port": 8301, "sse_port": 8302},
    }
    app_module.configure(cfg, session_token="settings-test-token")
    test_client = TestClient(app_module.app, client=client)
    _CLIENTS.append(test_client)
    return test_client


def test_profiles_endpoint_requires_session_token():
    client = make_client()
    res = client.get("/api/launchers/profiles")
    assert res.status_code == 403


def test_profiles_endpoint_rejects_bad_session_token():
    client = make_client()
    res = client.get("/api/launchers/profiles", headers=session_headers("bad-token"))
    assert res.status_code == 403


def test_profiles_lists_whitelisted_profiles_with_session_token():
    client = make_client()
    res = client.get("/api/launchers/profiles", headers=session_headers())
    assert res.status_code == 200
    profiles = res.json()["profiles"]
    server = next(p for p in profiles if p["profile_id"] == "server.default")
    assert server["kind"] == "server"
    assert server["allow_browser_start"] is False
    assert "argv" not in server
    assert "cwd" not in server


def test_status_is_deferred_until_process_model_exists():
    client = make_client()
    res = client.get(
        "/api/launchers/status",
        params={"profile_id": "server.default"},
        headers=session_headers(),
    )
    assert res.status_code == 501
    assert "process ownership" in res.text.lower()


def test_dry_run_rejects_unknown_profile():
    client = make_client()
    res = client.post(
        "/api/launchers/dry-run",
        json={"profile_id": "does-not-exist"},
        headers=session_headers(),
    )
    assert res.status_code == 404


def test_dry_run_never_accepts_raw_command_fields():
    client = make_client()
    res = client.post(
        "/api/launchers/dry-run",
        json={
            "profile_id": "server.default",
            "command": "rm -rf .",
            "path": "powershell",
            "env": {"TOKEN": "secret"},
            "args": ["--unsafe"],
        },
        headers=session_headers(),
    )
    assert res.status_code == 422


def test_dry_run_returns_server_built_argv():
    client = make_client()
    res = client.post(
        "/api/launchers/dry-run",
        json={"profile_id": "server.default"},
        headers=session_headers(),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["profile_id"] == "server.default"
    assert body["argv"] == ["uv", "run", "python", "run.py"]
    assert isinstance(body["argv"], list)


def test_start_requires_whitelisted_profile():
    client = make_client()
    res = client.post(
        "/api/launchers/start",
        json={"profile_id": "does-not-exist"},
        headers=session_headers(),
    )
    assert res.status_code == 404


def test_start_rejects_non_loopback_client():
    client = make_client(client=("203.0.113.10", 50000))
    res = client.post(
        "/api/launchers/start",
        json={"profile_id": "agent.api.minimax"},
        headers=session_headers(),
    )
    assert res.status_code == 403
    assert "loopback" in res.text.lower()


def test_server_default_browser_start_is_rejected():
    client = make_client()
    res = client.post(
        "/api/launchers/start",
        json={"profile_id": "server.default"},
        headers=session_headers(),
    )
    assert res.status_code == 403
    assert "server.default" in res.text.lower()


def test_risky_profile_requires_confirmation_before_other_start_checks():
    client = make_client()
    res = client.post(
        "/api/launchers/start",
        json={"profile_id": "agent.codex.bypass"},
        headers=session_headers(),
    )
    assert res.status_code == 403
    assert "confirmation" in res.text.lower()


def test_stop_is_deferred_without_process_model():
    client = make_client()
    res = client.post(
        "/api/launchers/stop",
        json={"profile_id": "server.default"},
        headers=session_headers(),
    )
    assert res.status_code == 501
    assert "process ownership" in res.text.lower()
