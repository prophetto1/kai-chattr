"""Tests for the retained backend runtime port surface."""

import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import main as app  # noqa: E402
from conftest import chattr_test_configure  # noqa: E402


class RuntimePortsTests(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.tmp.cleanup)
        chattr_test_configure(cls.tmp.name)
        cls.client = TestClient(app.app)

    def test_runtime_ports_returns_200_with_expected_shape(self):
        resp = self.client.get("/api/runtime/ports")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["mode"], "local")
        self.assertIn("host", body)
        self.assertEqual(body["ports"]["web"]["port"], 8300)
        self.assertEqual(body["ports"]["mcp_http"]["port"], 8301)
        self.assertEqual(body["ports"]["mcp_sse"]["port"], 8302)

    def test_runtime_ports_requires_no_browser_session_token(self):
        resp = self.client.get("/api/runtime/ports")
        self.assertEqual(resp.status_code, 200)

    def test_runtime_ports_listed_in_openapi(self):
        schema = self.client.get(
            "/openapi.json",
            headers={"X-Session-Token": "ui-test-token"},
        )
        self.assertEqual(schema.status_code, 200)
        self.assertIn("/api/runtime/ports", schema.json()["paths"])


if __name__ == "__main__":
    unittest.main()
