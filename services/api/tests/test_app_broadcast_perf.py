import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import main as app_module  # noqa: E402


class FastClient:
    def __init__(self):
        self.sent = []

    async def send_text(self, text):
        self.sent.append(text)


class SlowClient:
    async def send_text(self, text):
        await asyncio.sleep(60)


def test_broadcast_drops_slow_client(monkeypatch):
    monkeypatch.setattr(app_module, "BROADCAST_SEND_TIMEOUT_SECONDS", 0.01, raising=False)
    fast = FastClient()
    slow = SlowClient()
    app_module.ws_clients.clear()
    app_module.ws_clients.update({fast, slow})

    asyncio.run(asyncio.wait_for(app_module._broadcast("payload"), timeout=0.2))

    assert fast.sent == ["payload"]
    assert fast in app_module.ws_clients
    assert slow not in app_module.ws_clients
