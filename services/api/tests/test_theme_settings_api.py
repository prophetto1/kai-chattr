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
        app_module._save_settings()
        self.client = TestClient(app_module.app)

    def test_theme_catalog_lists_tokenized_themes(self):
        response = self.client.get("/api/themes", headers=_headers())

        self.assertEqual(response.status_code, 200)
        body = response.json()
        theme_ids = [theme["id"] for theme in body["items"]]
        self.assertEqual(theme_ids, ["day", "night", "catppuccin", "ember"])
        self.assertEqual(body["selected_theme"], "night")
        self.assertEqual(body["items"][0]["html_classes"], [])
        self.assertEqual(body["items"][1]["html_classes"], ["dark"])
        self.assertEqual(body["items"][2]["html_classes"], ["dark", "catppuccin"])
        self.assertEqual(body["items"][3]["html_classes"], ["dark", "ember"])

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

    def test_patch_settings_updates_font_and_contrast(self):
        response = self.client.patch(
            "/api/settings",
            headers=_headers(),
            json={"font": "mono", "contrast": "high"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["font"], "mono")
        self.assertEqual(response.json()["contrast"], "high")
        settings_path = Path(self.tmp.name) / "settings.json"
        saved = json.loads(settings_path.read_text("utf-8"))
        self.assertEqual(saved["font"], "mono")
        self.assertEqual(saved["contrast"], "high")

    def test_patch_settings_rejects_unknown_font(self):
        response = self.client.patch(
            "/api/settings",
            headers=_headers(),
            json={"font": "comic-sans"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["error"], "font is not available")
        self.assertEqual(app_module.room_settings["font"], "sans")

    def test_patch_settings_schema(self):
        response = self.client.get("/api/settings/schema", headers=_headers())

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["required"], ["selected_theme", "font", "contrast"])
        self.assertIn("selected_theme", body["properties"])
        self.assertIn("font", body["properties"])
        self.assertIn("contrast", body["properties"])

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
