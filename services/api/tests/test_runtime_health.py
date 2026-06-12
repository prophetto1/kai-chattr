"""Tests for the retained backend runtime port surface."""

import sys
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import conftest  # noqa: E402

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
        self.assertEqual(body["ports"]["frontend"]["port"], 8800)
        self.assertEqual(body["ports"]["api"]["port"], 8840)
        self.assertEqual(body["ports"]["mcp_http"]["port"], 8841)
        self.assertEqual(body["ports"]["mcp_sse"]["port"], 8842)
        self.assertNotIn("web", body["ports"])

    def test_runtime_ports_requires_no_browser_session_token(self):
        resp = self.client.get("/api/runtime/ports")
        self.assertEqual(resp.status_code, 200)

    def test_runtime_ports_listed_in_openapi(self):
        schema = self.client.get(
            "/openapi.json",
            headers=conftest.session_headers(),
        )
        self.assertEqual(schema.status_code, 200)
        self.assertIn("/api/runtime/ports", schema.json()["paths"])

    def test_api_does_not_serve_frontend_routes_or_static_assets(self):
        headers = conftest.session_headers()
        self.assertEqual(self.client.get("/workbench", headers=headers).status_code, 404)
        self.assertEqual(self.client.get("/workbench/", headers=headers).status_code, 404)
        self.assertEqual(self.client.get("/static/app.js", headers=headers).status_code, 404)

    def test_browser_session_endpoint_is_not_exposed(self):
        headers = conftest.session_headers()
        self.assertEqual(self.client.get("/api/session", headers=headers).status_code, 404)


if __name__ == "__main__":
    unittest.main()
