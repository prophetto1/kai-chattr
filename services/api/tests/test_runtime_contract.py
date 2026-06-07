"""Runtime architecture contract tests."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import main as app_module
from app.factory import create_app
from app.runtime_contract import (
    DEFAULT_API_PORT,
    DEFAULT_FRONTEND_PORT,
    DEFAULT_MCP_HTTP_PORT,
    DEFAULT_MCP_SSE_PORT,
)
from conftest import chattr_test_configure


class RuntimeArchitectureContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.tmp.cleanup)
        cls.token = chattr_test_configure(cls.tmp.name)
        cls.client = TestClient(app_module.app)

    def test_factory_creates_fastapi_app(self):
        created = create_app("contract-test")
        self.assertIsInstance(created, FastAPI)
        self.assertEqual(created.title, "contract-test")

    def test_runtime_default_ports_are_locked(self):
        self.assertEqual(DEFAULT_FRONTEND_PORT, 8800)
        self.assertEqual(DEFAULT_API_PORT, 8840)
        self.assertEqual(DEFAULT_MCP_HTTP_PORT, 8841)
        self.assertEqual(DEFAULT_MCP_SSE_PORT, 8842)

    def test_required_routes_are_registered(self):
        paths = {
            getattr(route, "path", None)
            for route in app_module.app.routes
            if getattr(route, "path", None)
        }
        self.assertIn("/api/runtime/ports", paths)
        self.assertIn("/api/status", paths)
        self.assertIn("/api/right-rail/capabilities", paths)
        self.assertIn("/ws", paths)

    def test_forbidden_browser_session_endpoint_is_absent(self):
        response = self.client.get(
            "/api/session",
            headers={"X-Session-Token": self.token},
        )
        self.assertEqual(response.status_code, 404)

    def test_api_does_not_own_frontend_routes(self):
        headers = {"X-Session-Token": self.token}
        self.assertEqual(self.client.get("/workbench", headers=headers).status_code, 404)
        self.assertEqual(self.client.get("/static/app.js", headers=headers).status_code, 404)

    def test_right_rail_capabilities_are_protected_and_available_when_authenticated(self):
        forbidden = self.client.get("/api/right-rail/capabilities")
        self.assertEqual(forbidden.status_code, 403)

        authed = self.client.get(
            "/api/right-rail/capabilities",
            headers={"X-Session-Token": self.token},
        )
        self.assertEqual(authed.status_code, 200)
        tab_ids = [tab["id"] for tab in authed.json()["tabs"]]
        self.assertEqual(tab_ids, ["rules", "jobs", "locked", "pins"])


if __name__ == "__main__":
    unittest.main()
