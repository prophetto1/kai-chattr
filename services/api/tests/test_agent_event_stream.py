import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


class AgentEventStreamTests(unittest.TestCase):
    def test_normalize_event_uses_stable_schema(self):
        from app.events.jsonl_stream import normalize_event

        event = normalize_event(
            "mcp.tool_call",
            source="mcp",
            actor="codex",
            result="ok",
            details={"tool_name": "chat_read"},
            timestamp="2026-05-14T08:00:00Z",
            event_id="evt_test",
        )

        self.assertEqual(
            event,
            {
                "schema_version": "chattr.agent_event.v1",
                "event_id": "evt_test",
                "timestamp": "2026-05-14T08:00:00Z",
                "event_type": "mcp.tool_call",
                "source": "mcp",
                "actor": "codex",
                "result": "ok",
                "details": {"tool_name": "chat_read"},
            },
        )

    def test_jsonl_stream_appends_normalized_events(self):
        from app.events.jsonl_stream import JsonlEventStream

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "agent_events.jsonl"
            stream = JsonlEventStream(path)

            stream.append(
                {
                    "event_type": "mcp.tool_call",
                    "source": "mcp",
                    "actor": "codex",
                    "result": "ok",
                    "details": {"tool_name": "chat_read"},
                }
            )
            stream.append(
                {
                    "event_type": "mcp.tool_call",
                    "source": "mcp",
                    "actor": "claude",
                    "result": "error",
                    "details": {"tool_name": "chat_send"},
                }
            )

            lines = path.read_text("utf-8").splitlines()
            self.assertEqual(len(lines), 2)
            records = [json.loads(line) for line in lines]
            self.assertEqual(records[0]["schema_version"], "chattr.agent_event.v1")
            self.assertEqual(records[0]["actor"], "codex")
            self.assertEqual(records[1]["result"], "error")


class ToolRegistryEventTests(unittest.TestCase):
    def test_tool_registry_emits_sanitized_tool_call_events(self):
        from app.mcp.tools import ToolDefinition, ToolRegistry

        class Sink:
            def __init__(self):
                self.records = []

            def append(self, event):
                self.records.append(event)
                return event

        def tool(sender: str, message: str) -> str:
            return f"sent {message}"

        sink = Sink()
        registry = ToolRegistry()
        registry.register(
            ToolDefinition(
                name="chat_test",
                handler=tool,
                category="chat",
                side_effect="writes_chat",
                identity_required=True,
                summary="Test tool.",
            )
        )
        registry.set_event_stream(sink)

        result = registry.instrumented_functions()[0](sender="codex", message="private text")

        self.assertEqual(result, "sent private text")
        self.assertEqual(len(sink.records), 1)
        event = sink.records[0]
        self.assertEqual(event["event_type"], "mcp.tool_call")
        self.assertEqual(event["source"], "mcp")
        self.assertEqual(event["actor"], "codex")
        self.assertEqual(event["result"], "ok")
        self.assertEqual(event["details"]["tool_name"], "chat_test")
        self.assertEqual(event["details"]["category"], "chat")
        serialized = json.dumps(event)
        self.assertNotIn("private text", serialized)
        self.assertNotIn("sent private text", serialized)

    def test_tool_registry_emits_exception_events_and_reraises(self):
        from app.mcp.tools import ToolDefinition, ToolRegistry

        class Sink:
            def __init__(self):
                self.records = []

            def append(self, event):
                self.records.append(event)
                return event

        def tool(sender: str) -> str:
            raise RuntimeError("boom")

        sink = Sink()
        registry = ToolRegistry()
        registry.register(
            ToolDefinition(
                name="chat_explode",
                handler=tool,
                category="chat",
                side_effect="writes_chat",
                identity_required=True,
                summary="Exploding test tool.",
            )
        )
        registry.set_event_stream(sink)

        with self.assertRaises(RuntimeError):
            registry.instrumented_functions()[0](sender="codex")

        self.assertEqual(len(sink.records), 1)
        self.assertEqual(sink.records[0]["result"], "error")
        self.assertEqual(sink.records[0]["details"]["error_type"], "RuntimeError")
        self.assertNotIn("boom", json.dumps(sink.records[0]))


class McpBridgeEventTests(unittest.TestCase):
    def test_mcp_bridge_preview_patch_tool_emits_jsonl_event(self):
        from app.mcp import bridge as mcp_bridge

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "agent_events.jsonl"
            mcp_bridge.configure_event_stream(path)
            try:
                tool = next(
                    func
                    for func in mcp_bridge._ALL_TOOLS
                    if func.__name__ == "chat_preview_patch"
                )
                result = json.loads(
                    tool(
                        "alpha\n",
                        [{"search": "alpha", "replace": "BETA"}],
                    )
                )
            finally:
                mcp_bridge.configure_event_stream(None)

            self.assertEqual(result, {"ok": True, "content": "BETA\n", "applied": 1})
            records = [json.loads(line) for line in path.read_text("utf-8").splitlines()]
            self.assertEqual(len(records), 1)
            self.assertEqual(records[0]["event_type"], "mcp.tool_call")
            self.assertEqual(records[0]["details"]["tool_name"], "chat_preview_patch")
            self.assertNotIn("alpha", json.dumps(records[0]))
            self.assertNotIn("BETA", json.dumps(records[0]))


if __name__ == "__main__":
    unittest.main()
