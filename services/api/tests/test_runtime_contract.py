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
    resolve_session_token_from_env,
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
        self.assertIn("/healthz", paths)
        self.assertIn("/schemas/pydantic/status", paths)
        self.assertIn("/observability/status", paths)
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

    def test_healthz_is_public_and_reports_database_mode(self):
        response = self.client.get("/healthz")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["ok"], True)
        self.assertIn("database_mode", response.json())
        self.assertEqual(response.json()["database_ready"], True)

    def test_healthz_reports_configured_database_readiness(self):
        with tempfile.TemporaryDirectory() as data_dir:
            chattr_test_configure(
                data_dir,
                extra_cfg={
                    "database": {
                        "mode": "postgres",
                        "url": f"sqlite:///{Path(data_dir) / 'rules.db'}",
                    },
                },
            )
            client = TestClient(app_module.app)

            try:
                response = client.get("/healthz")
            finally:
                chattr_test_configure(self.tmp.name, session_token=self.token)

        body = response.json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(body["ok"], True)
        self.assertEqual(body["database_mode"], "postgres")
        self.assertEqual(body["database_ready"], True)

    def test_right_rail_capabilities_are_protected_and_available_when_authenticated(self):
        forbidden = self.client.get("/api/right-rail/capabilities")
        self.assertEqual(forbidden.status_code, 403)

        authed = self.client.get(
            "/api/right-rail/capabilities",
            headers={"X-Session-Token": self.token},
        )
        self.assertEqual(authed.status_code, 200)
        tabs = authed.json()["tabs"]
        tab_ids = [tab["id"] for tab in tabs]
        self.assertEqual(tab_ids, ["rules", "jobs", "decisions", "pins"])
        self.assertEqual(
            {tab["id"]: tab["surface"] for tab in tabs},
            {
                "rules": "board",
                "jobs": "dock",
                "decisions": "board",
                "pins": "board",
            },
        )
        decisions_tab = next(tab for tab in tabs if tab["id"] == "decisions")
        self.assertEqual(decisions_tab["category"], "locked")

    def test_configured_origin_gets_cors_preflight_without_session_token(self):
        with tempfile.TemporaryDirectory() as data_dir:
            token = chattr_test_configure(
                data_dir,
                extra_cfg={
                    "security": {
                        "allowed_origins": ["https://dev.kai-chattr.pages.dev"],
                    },
                },
            )
            client = TestClient(app_module.app)

            preflight = client.options(
                "/api/right-rail/capabilities",
                headers={
                    "Origin": "https://dev.kai-chattr.pages.dev",
                    "Access-Control-Request-Method": "GET",
                    "Access-Control-Request-Headers": "x-session-token",
                },
            )
            self.assertEqual(preflight.status_code, 204)
            self.assertEqual(
                preflight.headers["access-control-allow-origin"],
                "https://dev.kai-chattr.pages.dev",
            )

            authed = client.get(
                "/api/right-rail/capabilities",
                headers={
                    "Origin": "https://dev.kai-chattr.pages.dev",
                    "X-Session-Token": token,
                },
            )
            self.assertEqual(authed.status_code, 200)
            self.assertEqual(
                authed.headers["access-control-allow-origin"],
                "https://dev.kai-chattr.pages.dev",
            )

    def test_hosted_session_token_fails_closed_when_missing(self):
        from pytest import MonkeyPatch

        monkeypatch = MonkeyPatch()
        monkeypatch.delenv("KAI_CHATTR_SESSION_TOKEN", raising=False)
        monkeypatch.delenv("CHATTR_SESSION_TOKEN", raising=False)
        self.addCleanup(monkeypatch.undo)

        with self.assertRaises(RuntimeError):
            resolve_session_token_from_env(require_configured=True)


if __name__ == "__main__":
    unittest.main()
