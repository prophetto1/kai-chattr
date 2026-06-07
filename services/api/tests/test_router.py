import json
import sys
import tempfile
import unittest
import warnings
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.runtime.routing import Router


class RouterMentionTests(unittest.TestCase):
    def test_hyphenated_agent_name_is_parsed_as_full_mention(self):
        router = Router(["telegram-bridge"], default_mention="none")

        self.assertEqual(
            set(router.parse_mentions("please ask @telegram-bridge to check")),
            {"telegram-bridge"},
        )

    def test_shorter_agent_name_does_not_match_prefix_of_hyphenated_unknown(self):
        router = Router(["telegram"], default_mention="none")

        self.assertEqual(router.parse_mentions("@telegram-bridge check"), [])
        self.assertEqual(router.get_targets("ben", "@telegram-bridge check"), [])

    def test_longest_hyphenated_name_wins_when_prefix_agent_also_exists(self):
        router = Router(["telegram", "telegram-bridge"], default_mention="none")

        self.assertEqual(
            set(router.parse_mentions("@telegram-bridge check")),
            {"telegram-bridge"},
        )

    def test_unknown_exact_handle_still_does_not_route(self):
        router = Router(["telegram-bridge"], default_mention="none")

        self.assertEqual(router.parse_mentions("@telegram-bot check"), [])
        self.assertEqual(router.get_targets("ben", "@telegram-bot check"), [])

    def test_default_mention_all_routes_unmentioned_human_message_to_all_agents(self):
        router = Router(["claude", "codex"], default_mention="all")

        self.assertEqual(
            set(router.get_targets("jon", "can both of you look at this?")),
            {"claude", "codex"},
        )

    def test_default_mention_none_leaves_unmentioned_human_message_unrouted(self):
        router = Router(["claude", "codex"], default_mention="none")

        self.assertEqual(router.get_targets("jon", "status?"), [])

    def test_default_mention_both_remains_deprecated_alias_for_all(self):
        with warnings.catch_warnings(record=True) as caught:
            warnings.simplefilter("always")
            router = Router(["claude", "codex"], default_mention="both")

        self.assertEqual(
            set(router.get_targets("jon", "status?")),
            {"claude", "codex"},
        )
        self.assertTrue(
            any(item.category is DeprecationWarning for item in caught),
            "expected default_mention='both' to emit a DeprecationWarning",
        )

    def test_default_mention_can_be_updated_at_runtime(self):
        router = Router(["claude", "codex"], default_mention="none")

        router.set_default_mention("all")

        self.assertEqual(
            set(router.get_targets("jon", "status?")),
            {"claude", "codex"},
        )


class RoutingSettingsTests(unittest.TestCase):
    def test_saved_default_mention_setting_overrides_config_default(self):
        from app import main as app

        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp)
            (data_dir / "settings.json").write_text(
                json.dumps({"channels": ["general"], "default_mention": "all"}),
                "utf-8",
            )
            cfg = {
                "server": {
                    "port": 8300,
                    "data_dir": str(data_dir),
                    "remote_agent_token": "remote-test-token",
                },
                "agents": {
                    "claude": {"command": "claude", "cwd": "."},
                    "codex": {"command": "codex", "cwd": "."},
                },
                "routing": {"default": "none", "max_agent_hops": 4},
                "images": {"upload_dir": str(data_dir / "uploads")},
                "mcp": {"http_port": 8301, "sse_port": 8302},
            }

            app.configure(cfg, session_token="settings-test-token")

            self.assertEqual(
                set(app.router.get_targets("jon", "status?", "general")),
                {"claude", "codex"},
            )


if __name__ == "__main__":
    unittest.main()
