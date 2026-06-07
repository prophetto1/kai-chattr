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


def session_headers(token: str = "platform-test-token"):
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


def make_client():
    from app import main as app_module

    app_module = importlib.reload(app_module)
    tmp = tempfile.TemporaryDirectory()
    _TEMPDIRS.append(tmp)
    data_dir = Path(tmp.name)
    cfg = {
        "server": {
            "port": 8840,
            "data_dir": str(data_dir),
            "remote_agent_token": "remote-test-token",
        },
        "agents": {
            "codex": {
                "command": "codex",
                "cwd": ".",
                "color": "#10a37f",
                "label": "Codex",
            }
        },
        "routing": {"default": "none", "max_agent_hops": 4},
        "images": {"upload_dir": str(data_dir / "uploads"), "max_size_mb": 10},
        "mcp": {"http_port": 8841, "sse_port": 8842},
    }
    app_module.configure(cfg, session_token="platform-test-token")
    client = TestClient(app_module.app)
    _CLIENTS.append(client)
    return client


def test_platform_requires_session_token():
    client = make_client()
    res = client.get("/api/platform")
    assert res.status_code == 403


def test_platform_returns_current_platform_with_session_token():
    client = make_client()
    res = client.get("/api/platform", headers=session_headers())
    assert res.status_code == 200
    assert res.json() == {"platform": sys.platform}


def test_open_path_validates_missing_path():
    client = make_client()
    res = client.post("/api/open-path", json={}, headers=session_headers())
    assert res.status_code == 400
    assert res.json() == {"error": "no path"}


def test_open_path_reports_missing_path_without_launching_process():
    client = make_client()
    missing = str(Path(_TEMPDIRS[-1].name) / "missing")
    res = client.post(
        "/api/open-path",
        json={"path": missing},
        headers=session_headers(),
    )
    assert res.status_code == 404
    assert res.json() == {"error": "path not found"}
