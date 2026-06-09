import importlib
import sys
import tempfile
import time
from pathlib import Path

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _configure_runtime(tmp_dir: str):
    from app import main as app_module

    app_module = importlib.reload(app_module)
    cfg = {
        "server": {
            "port": 8840,
            "data_dir": tmp_dir,
            "remote_agent_token": "remote-test-token",
        },
        "frontend": {"dev_host": "127.0.0.1", "dev_port": 8800},
        "agents": {
            "codex": {
                "command": "codex",
                "cwd": "..",
                "color": "#10a37f",
                "label": "Codex",
            }
        },
        "routing": {"default": "none", "max_agent_hops": 4},
        "images": {
            "upload_dir": str(Path(tmp_dir) / "uploads"),
            "max_size_mb": 10,
        },
        "mcp": {"http_port": 8841, "sse_port": 8842},
    }
    app_module.configure(cfg, session_token="runtime-loop-token")
    return app_module


def _drain_initial_websocket_payload(websocket):
    while True:
        payload = websocket.receive_json()
        if payload.get("type") == "history_batch" and payload.get("done") is True:
            return


def _wait_for_message_in_store(
    client: TestClient,
    expected_text: str,
    *,
    expected_sender: str | None = None,
    timeout_s: float = 2.0,
) -> dict:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        response = client.get(
            "/api/messages",
            params={"limit": 50, "channel": "general"},
            headers={"X-Session-Token": "runtime-loop-token"},
        )
        assert response.status_code == 200
        for message in response.json():
            if message.get("text") != expected_text:
                continue
            if expected_sender is not None and message.get("sender") != expected_sender:
                continue
            return message
        time.sleep(0.05)
    raise AssertionError(f"did not find message text: {expected_text}")


def _poll_until_queue_entry(client: TestClient, agent_name: str, agent_token: str) -> dict:
    deadline = time.monotonic() + 2.0
    last_payload = None
    while time.monotonic() < deadline:
        response = client.get(
            f"/api/poll/{agent_name}",
            headers={"Authorization": f"Bearer {agent_token}"},
        )
        assert response.status_code == 200
        last_payload = response.json()
        entries = last_payload.get("entries") or []
        if entries:
            return entries[0]
        time.sleep(0.05)
    raise AssertionError(f"no queued trigger for {agent_name}: {last_payload}")


def test_websocket_mention_reaches_registered_agent_queue_and_response_broadcasts():
    with tempfile.TemporaryDirectory() as tmp:
        app_module = _configure_runtime(tmp)

        with TestClient(app_module.app) as client:
            with client.websocket_connect("/ws?token=runtime-loop-token") as websocket:
                _drain_initial_websocket_payload(websocket)

                registration = client.post(
                    "/api/register",
                    json={"base": "codex"},
                    headers={"X-Chattr-Remote-Token": "remote-test-token"},
                )
                assert registration.status_code == 200
                registered = registration.json()
                agent_name = registered["name"]
                agent_token = registered["token"]

                user_message = f"@{agent_name} runtime loop check"
                websocket.send_json({
                    "type": "message",
                    "sender": "user",
                    "text": user_message,
                    "channel": "general",
                })
                _wait_for_message_in_store(client, user_message, expected_sender="user")

                queued = _poll_until_queue_entry(client, agent_name, agent_token)
                assert queued["sender"] == "user"
                assert queued["text"] == f"user: {user_message}"
                assert queued["channel"] == "general"

                agent_reply = "runtime loop acknowledged"
                sent = client.post(
                    "/api/send",
                    json={"text": agent_reply, "channel": "general"},
                    headers={"Authorization": f"Bearer {agent_token}"},
                )
                assert sent.status_code == 200
                assert sent.json()["sender"] == agent_name

                reply = _wait_for_message_in_store(
                    client,
                    agent_reply,
                    expected_sender=agent_name,
                )
                assert reply["sender"] == agent_name
                assert reply["channel"] == "general"
