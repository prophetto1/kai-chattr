from fastapi.testclient import TestClient

from app.main import app


def test_ws_hello_then_echo():
    with TestClient(app) as client:
        with client.websocket_connect("/ws") as ws:
            assert ws.receive_json() == {"type": "hello"}
            ws.send_text("ping")
            assert ws.receive_json() == {"echo": "ping"}
