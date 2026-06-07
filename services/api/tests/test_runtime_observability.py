"""Tests for the retained backend runtime observability helpers."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from conftest import chattr_test_configure  # noqa: E402
from app.events import JsonlEventStream, RUNTIME_EVENT_SCHEMA_VERSION  # noqa: E402
from app.observability import (  # noqa: E402
    ForbiddenAttributeError,
    events_dropped_counter,
    events_ingest_counter,
    events_ingest_duration_ms,
    events_rejected_counter,
    force_flush,
    validate_attrs,
)


def _read_jsonl(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").strip().splitlines()
        if line.strip()
    ]


class RuntimeObservabilityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.tmp.cleanup)
        chattr_test_configure(cls.tmp.name)

    def setUp(self):
        force_flush()
        for fname in (
            "runtime_events.jsonl",
            "otel_traces.jsonl",
            "otel_metrics.jsonl",
        ):
            p = Path(self.tmp.name) / fname
            if p.exists():
                p.unlink()

    def test_jsonl_event_append_emits_persist_span(self):
        stream = JsonlEventStream(
            Path(self.tmp.name) / "runtime_events.jsonl",
            schema_version=RUNTIME_EVENT_SCHEMA_VERSION,
        )
        stream.append({"event_type": "runtime.test", "details": {"ok": True}})

        force_flush()

        events = _read_jsonl(Path(self.tmp.name) / "runtime_events.jsonl")
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["schema_version"], RUNTIME_EVENT_SCHEMA_VERSION)
        self.assertEqual(events[0]["event_type"], "runtime.test")

        traces = _read_jsonl(Path(self.tmp.name) / "otel_traces.jsonl")
        names = {record["name"] for record in traces}
        self.assertIn("runtime.events.persist", names)

    def test_runtime_metric_instruments_are_initialized(self):
        self.assertIsNotNone(events_ingest_counter())
        self.assertIsNotNone(events_rejected_counter())
        self.assertIsNotNone(events_dropped_counter())
        self.assertIsNotNone(events_ingest_duration_ms())

    def test_validate_attrs_rejects_forbidden_keys(self):
        for forbidden in ("command_text", "cwd", "env", "secret", "token", "username"):
            with self.assertRaises(ForbiddenAttributeError):
                validate_attrs({forbidden: "anything"})

    def test_validate_attrs_passes_allowed_keys(self):
        allowed = {
            "event.type": "runtime.test",
            "host_id": "host-1",
            "terminal_id": "term-1",
            "result": "ok",
            "reason": "auth",
            "http.status_code": 200,
        }
        self.assertEqual(validate_attrs(allowed), allowed)


if __name__ == "__main__":
    unittest.main()
