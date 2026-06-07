"""Normalized JSONL event stream for local Chattr runtime activity."""

from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.observability import get_tracer, validate_attrs


SCHEMA_VERSION = "chattr.agent_event.v1"


def normalize_event(
    event_type: str,
    *,
    source: str = "runtime",
    actor: str = "",
    result: str = "ok",
    details: dict[str, Any] | None = None,
    timestamp: str | None = None,
    event_id: str | None = None,
    schema_version: str = SCHEMA_VERSION,
) -> dict[str, Any]:
    """Return a stable, JSON-compatible event record.

    `schema_version` defaults to chattr.agent_event.v1 (the original schema
    for chattr-side MCP tool-call events). Pass an explicit value for other
    schemas - e.g. chattr.runtime_event.v1 for backend-emitted runtime
    events written to data/runtime_events.jsonl.
    """

    safe_details = _json_safe_dict(details or {})
    return {
        "schema_version": schema_version,
        "event_id": event_id or uuid.uuid4().hex,
        "timestamp": timestamp or _utc_now_iso(),
        "event_type": str(event_type),
        "source": str(source),
        "actor": str(actor or ""),
        "result": str(result),
        "details": safe_details,
    }


class JsonlEventStream:
    """Append normalized event records to a local JSONL file.

    Each stream is tagged with a `schema_version` that's stamped onto every
    appended record. Default is chattr.agent_event.v1 for back-compat with
    the existing MCP tool-call event stream; runtime event stream callers
    must construct with `schema_version="chattr.runtime_event.v1"` per the
    JSONL File Separation contract in the runtime event plan.
    """

    def __init__(self, path: str | Path, *, schema_version: str = SCHEMA_VERSION) -> None:
        self.path = Path(path)
        self.schema_version = schema_version
        self._lock = threading.Lock()

    def append(self, event: dict[str, Any]) -> dict[str, Any]:
        record = normalize_event(
            event.get("event_type", "runtime.event"),
            source=event.get("source", "runtime"),
            actor=event.get("actor", ""),
            result=event.get("result", "ok"),
            details=event.get("details", {}),
            timestamp=event.get("timestamp"),
            event_id=event.get("event_id"),
            schema_version=self.schema_version,
        )
        line = json.dumps(record, ensure_ascii=False, sort_keys=True)
        tracer = get_tracer()
        with tracer.start_as_current_span("runtime.events.persist") as span:
            for k, v in validate_attrs(
                {"schema_version": self.schema_version, "result": "ok"}
            ).items():
                span.set_attribute(k, v)
            with self._lock:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                with self.path.open("a", encoding="utf-8") as handle:
                    handle.write(f"{line}\n")
        return record


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _json_safe_dict(value: dict[str, Any]) -> dict[str, Any]:
    return json.loads(json.dumps(value, ensure_ascii=False, default=str))
