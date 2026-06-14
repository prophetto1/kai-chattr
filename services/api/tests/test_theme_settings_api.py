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

from app import main as app_module  # noqa: E402
from conftest import chattr_test_configure  # noqa: E402


def _headers():
    import conftest
    return {"X-Session-Token": conftest.TEST_SESSION_TOKEN}


class ThemeSettingsApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        chattr_test_configure(self.tmp.name, session_token="theme-test-token")
        app_module.room_settings["selected_theme"] = "night"
        app_module.room_settings["fonts"] = {}
        app_module._save_settings()
        self.client = TestClient(app_module.app)

    def test_theme_catalog_lists_tokenized_themes(self):
        response = self.client.get("/api/themes", headers=_headers())

        self.assertEqual(response.status_code, 200)
        body = response.json()
        theme_ids = [theme["id"] for theme in body["items"]]
        self.assertEqual(theme_ids, ["day", "night", "catppuccin", "ember", "graphite"])
        self.assertEqual(body["selected_theme"], "night")
        self.assertEqual(body["items"][0]["html_classes"], [])
        self.assertEqual(body["items"][1]["html_classes"], ["dark"])
        self.assertEqual(body["items"][2]["html_classes"], ["dark", "catppuccin"])
        self.assertEqual(body["items"][3]["html_classes"], ["dark", "ember"])
        self.assertEqual(body["items"][4]["html_classes"], ["dark", "graphite"])

    def test_patch_settings_persists_selected_theme(self):
        response = self.client.patch(
            "/api/settings",
            headers=_headers(),
            json={"selected_theme": "ember"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["selected_theme"], "ember")
        settings_path = Path(self.tmp.name) / "settings.json"
        saved = json.loads(settings_path.read_text("utf-8"))
        self.assertEqual(saved["selected_theme"], "ember")

    def test_patch_settings_persists_fonts(self):
        response = self.client.patch(
            "/api/settings",
            headers=_headers(),
            json={"fonts": {"ui": "geist", "mono": "ibm-plex-mono"}},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["fonts"], {"ui": "geist", "mono": "ibm-plex-mono"})
        settings_path = Path(self.tmp.name) / "settings.json"
        saved = json.loads(settings_path.read_text("utf-8"))
        self.assertEqual(saved["fonts"], {"ui": "geist", "mono": "ibm-plex-mono"})

    def test_patch_settings_rejects_unknown_font_slot(self):
        response = self.client.patch(
            "/api/settings",
            headers=_headers(),
            json={"fonts": {"bogus": "whatever"}},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "font slot is not available")

    def test_patch_settings_schema(self):
        response = self.client.get("/api/settings/schema", headers=_headers())

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["required"], ["selected_theme"])
        self.assertIn("selected_theme", body["properties"])
        self.assertIn("fonts", body["properties"])
        self.assertNotIn("font", body["properties"])
        self.assertNotIn("contrast", body["properties"])

    def test_patch_settings_rejects_unknown_theme(self):
        response = self.client.patch(
            "/api/settings",
            headers=_headers(),
            json={"selected_theme": "solarized"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "selected_theme is not available")
        self.assertEqual(app_module.room_settings["selected_theme"], "night")


if __name__ == "__main__":
    unittest.main()
