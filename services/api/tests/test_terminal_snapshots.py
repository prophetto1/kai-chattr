"""Tests for the in-memory terminal snapshot API."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import conftest  # noqa: E402

from app.events import validate_payload  # noqa: E402
from app import main as app  # noqa: E402


class TerminalSnapshotApiTests(unittest.TestCase):
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
        import conftest
        conftest.mint_test_session(app)
        cls.client = TestClient(app.app)

    def setUp(self):
        with app.terminal_snapshots_lock:
            app.terminal_snapshots.clear()
        runtime_events_path = Path(self.tmp.name) / "runtime_events.jsonl"
        if runtime_events_path.exists():
            runtime_events_path.unlink()

    def test_terminal_routes_remain_in_openapi(self):
        schema = self.client.get(
            "/openapi.json",
            headers=conftest.session_headers(),
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
            headers=conftest.session_headers(),
        )
        self.assertEqual(fetched.status_code, 200)
        snapshot = fetched.json()["snapshot"]
        self.assertEqual(snapshot["name"], "codex")
        self.assertEqual(snapshot["text"], "line 1\nline 2")
        self.assertEqual(snapshot["captured_at"], 123.0)

        runtime_events = [
            json.loads(line)
            for line in (Path(self.tmp.name) / "runtime_events.jsonl").read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
        event_types = [event["event_type"] for event in runtime_events]
        self.assertIn("terminal.snapshot.write", event_types)
        self.assertIn("terminal.snapshot.read", event_types)
        write_event = next(event for event in runtime_events if event["event_type"] == "terminal.snapshot.write")
        self.assertEqual(write_event["actor"], "codex")
        self.assertEqual(write_event["details"]["agent_name"], "codex")
        self.assertEqual(write_event["details"]["line_count"], 2)
        self.assertGreater(write_event["details"]["byte_count"], 0)
        self.assertNotIn("text", write_event["details"])

        validate_payload(write_event["event_type"], write_event["details"])
        read_event = next(event for event in runtime_events if event["event_type"] == "terminal.snapshot.read")
        validate_payload(read_event["event_type"], read_event["details"])

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
