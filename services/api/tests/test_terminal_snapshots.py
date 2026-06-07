"""Tests for the in-memory terminal snapshot API."""

import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import main as app  # noqa: E402


class TerminalSnapshotApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.tmp.cleanup)
        cfg = {
            "server": {
                "port": 8300,
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
            "mcp": {"http_port": 8301, "sse_port": 8302},
        }
        app.configure(cfg, session_token="ui-test-token")
        cls.client = TestClient(app.app)

    def setUp(self):
        with app.terminal_snapshots_lock:
            app.terminal_snapshots.clear()

    def test_terminal_routes_remain_in_openapi(self):
        schema = self.client.get(
            "/openapi.json",
            headers={"X-Session-Token": "ui-test-token"},
        )
        self.assertEqual(schema.status_code, 200)
        paths = schema.json()["paths"]
        self.assertIn("/api/terminal/{agent_name}", paths)
        self.assertIn("get", paths["/api/terminal/{agent_name}"])
        self.assertIn("post", paths["/api/terminal/{agent_name}"])

    def test_registered_agent_can_post_and_ui_can_read_snapshot(self):
        reg = self.client.post(
            "/api/register",
            json={"base": "codex"},
            headers={"X-Agentchattr-Remote-Token": "remote-test-token"},
        )
        self.assertEqual(reg.status_code, 200)
        token = reg.json()["token"]

        posted = self.client.post(
            "/api/terminal/codex",
            json={"text": "line 1\nline 2", "captured_at": 123.0},
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(posted.status_code, 200)

        fetched = self.client.get(
            "/api/terminal/codex",
            headers={"X-Session-Token": "ui-test-token"},
        )
        self.assertEqual(fetched.status_code, 200)
        snapshot = fetched.json()["snapshot"]
        self.assertEqual(snapshot["name"], "codex")
        self.assertEqual(snapshot["text"], "line 1\nline 2")
        self.assertEqual(snapshot["captured_at"], 123.0)

    def test_wrong_agent_token_cannot_post_for_other_instance(self):
        reg1 = self.client.post(
            "/api/register",
            json={"base": "codex"},
            headers={"X-Agentchattr-Remote-Token": "remote-test-token"},
        )
        reg2 = self.client.post(
            "/api/register",
            json={"base": "codex"},
            headers={"X-Agentchattr-Remote-Token": "remote-test-token"},
        )
        self.assertEqual(reg1.status_code, 200)
        self.assertEqual(reg2.status_code, 200)
        token1 = reg1.json()["token"]
        name2 = reg2.json()["name"]

        posted = self.client.post(
            f"/api/terminal/{name2}",
            json={"text": "wrong owner"},
            headers={"Authorization": f"Bearer {token1}"},
        )
        self.assertEqual(posted.status_code, 403)


if __name__ == "__main__":
    unittest.main()
