"""Join system message on agent registration (plan: Phase A, Task 6).

Mirrors the existing leave-message convention (msg_type="leave",
sender=agent name) with msg_type="join" posted once per active
registration. Pending slot-2+ instances post nothing until claimed.
"""

import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import main as app  # noqa: E402


class ChatJoinMessageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.tmp.cleanup)
        cfg = {
            "server": {
                "port": 8840,
                "data_dir": cls.tmp.name,
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
            "images": {"upload_dir": str(Path(cls.tmp.name) / "uploads"), "max_size_mb": 10},
            "mcp": {"http_port": 8841, "sse_port": 8842},
        }
        app.configure(cfg, session_token="ui-test-token")
        cls.client = TestClient(app.app)

    def _join_messages(self, name: str) -> list[dict]:
        return [
            m
            for m in app.store.get_recent(200)
            if m.get("type") == "join" and m.get("sender") == name
        ]

    def test_active_registration_posts_one_join_message(self):
        reg = self.client.post(
            "/api/register",
            json={"base": "codex"},
            headers={"X-Agentchattr-Remote-Token": "remote-test-token"},
        )
        self.assertEqual(reg.status_code, 200)
        name = reg.json()["name"]
        joins = self._join_messages(name)
        self.assertEqual(len(joins), 1)
        self.assertIn("entered the chat", joins[0]["text"])

        # A second registration of the same base lands as a pending slot-2
        # instance — no join message until it is claimed/named.
        reg2 = self.client.post(
            "/api/register",
            json={"base": "codex"},
            headers={"X-Agentchattr-Remote-Token": "remote-test-token"},
        )
        self.assertEqual(reg2.status_code, 200)
        if reg2.json().get("state") == "pending":
            self.assertEqual(len(self._join_messages(reg2.json()["name"])), 0)


if __name__ == "__main__":
    unittest.main()
