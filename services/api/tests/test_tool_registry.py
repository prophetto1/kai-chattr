import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class ToolRegistryTests(unittest.TestCase):
    def test_registry_manifest_hides_handlers_and_preserves_order(self):
        from app.mcp.tools import ToolDefinition, ToolRegistry

        def first_tool():
            return "first"

        def second_tool():
            return "second"

        registry = ToolRegistry()
        registry.register(
            ToolDefinition(
                name="first_tool",
                handler=first_tool,
                category="chat",
                side_effect="read_only",
                identity_required=False,
                summary="First test tool.",
            )
        )
        registry.register(
            ToolDefinition(
                name="second_tool",
                handler=second_tool,
                category="proposal",
                side_effect="proposes_change",
                identity_required=True,
                summary="Second test tool.",
            )
        )

        self.assertEqual(registry.functions(), [first_tool, second_tool])
        self.assertEqual(
            registry.manifest(),
            [
                {
                    "name": "first_tool",
                    "category": "chat",
                    "side_effect": "read_only",
                    "identity_required": False,
                    "summary": "First test tool.",
                },
                {
                    "name": "second_tool",
                    "category": "proposal",
                    "side_effect": "proposes_change",
                    "identity_required": True,
                    "summary": "Second test tool.",
                },
            ],
        )

    def test_duplicate_tool_names_are_rejected(self):
        from app.mcp.tools import ToolDefinition, ToolRegistry

        def tool():
            return "ok"

        registry = ToolRegistry()
        definition = ToolDefinition(
            name="dupe",
            handler=tool,
            category="chat",
            side_effect="read_only",
            identity_required=False,
            summary="Duplicate test tool.",
        )

        registry.register(definition)

        with self.assertRaises(ValueError):
            registry.register(definition)


class McpToolManifestTests(unittest.TestCase):
    def test_mcp_bridge_registers_tools_through_registry(self):
        from app.mcp import bridge as mcp_bridge

        manifest_names = [entry["name"] for entry in mcp_bridge.tool_manifest()]
        registered_function_names = [func.__name__ for func in mcp_bridge._ALL_TOOLS]

        self.assertEqual(registered_function_names, manifest_names)
        self.assertEqual(len(manifest_names), len(set(manifest_names)))
        self.assertIn("chat_send", manifest_names)
        self.assertIn("chat_propose_job", manifest_names)
        self.assertIn("chat_tool_manifest", manifest_names)
        self.assertIn("chat_preview_patch", manifest_names)

    def test_chat_tool_manifest_returns_json_metadata(self):
        from app.mcp import bridge as mcp_bridge

        data = json.loads(mcp_bridge.chat_tool_manifest())
        by_name = {entry["name"]: entry for entry in data}

        self.assertEqual(by_name["chat_tool_manifest"]["side_effect"], "read_only")
        self.assertEqual(by_name["chat_preview_patch"]["category"], "proposal")
        self.assertEqual(by_name["chat_preview_patch"]["side_effect"], "read_only")
        self.assertNotIn("handler", by_name["chat_preview_patch"])

    def test_chat_preview_patch_returns_structured_kernel_result(self):
        from app.mcp import bridge as mcp_bridge

        result = json.loads(
            mcp_bridge.chat_preview_patch(
                "alpha\nbeta\n",
                [
                    {
                        "mode": "replaceLines",
                        "startLine": 2,
                        "endLine": 2,
                        "content": "BETA",
                    }
                ],
            )
        )

        self.assertEqual(result, {"ok": True, "content": "alpha\nBETA\n", "applied": 1})


if __name__ == "__main__":
    unittest.main()
