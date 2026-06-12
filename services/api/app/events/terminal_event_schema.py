"""Validation + normalization for backend runtime events.

Per the frozen runtime host plan (2026-05-16), event envelopes follow a
JSON-RPC-style shape. This module validates incoming envelopes against the chattr.runtime_event.v1
schema and rejects unknown event types.

Distinct from server/events/jsonl_stream.py which carries chattr-side MCP
tool-call events (chattr.agent_event.v1 schema). Both schemas coexist via
file separation: data/agent_events.jsonl vs data/runtime_events.jsonl
(see plan's JSONL File Separation section).
"""

from __future__ import annotations

from typing import Any

SCHEMA_VERSION = "chattr.runtime_event.v1"

KNOWN_EVENT_TYPES: frozenset[str] = frozenset(
    {
        "terminal.opened",
        "terminal.bytes",
        "terminal.cwd",
        "terminal.prompt.start",
        "terminal.command.start",
        "terminal.command.end",
        "terminal.snapshot.write",
        "terminal.snapshot.read",
        "terminal.attention_needed",
        "terminal.approval.actioned",
        "terminal.approval.resolved",
        "terminal.exited",
        "terminal.closed",
        "runtime.events.dropped",
    }
)


class EventValidationError(ValueError):
    """Raised when an event envelope or payload fails validation."""


def validate_envelope(raw: Any) -> dict[str, Any]:
    """Validate an event envelope; return a normalized dict or raise.

    Required envelope fields: host_id (non-empty str), sequence_number
    (non-negative int), type (known), wall_clock (str), monotonic_ms
    (non-negative int), payload (dict). Optional: terminal_id (str | None).
    """
    if not isinstance(raw, dict):
        raise EventValidationError("envelope must be a JSON object")

    host_id = raw.get("host_id")
    if not isinstance(host_id, str) or not host_id.strip():
        raise EventValidationError("host_id must be a non-empty string")

    sequence_number = raw.get("sequence_number")
    if not isinstance(sequence_number, int) or isinstance(sequence_number, bool) or sequence_number < 0:
        raise EventValidationError("sequence_number must be a non-negative integer")

    event_type = raw.get("type")
    if not isinstance(event_type, str):
        raise EventValidationError("type must be a string")
    if event_type not in KNOWN_EVENT_TYPES:
        raise EventValidationError(f"unknown event type: {event_type}")

    wall_clock = raw.get("wall_clock")
    if not isinstance(wall_clock, str) or not wall_clock.strip():
        raise EventValidationError("wall_clock must be a non-empty ISO-8601 string")

    monotonic_ms = raw.get("monotonic_ms")
    if not isinstance(monotonic_ms, int) or isinstance(monotonic_ms, bool) or monotonic_ms < 0:
        raise EventValidationError("monotonic_ms must be a non-negative integer")

    payload = raw.get("payload")
    if not isinstance(payload, dict):
        raise EventValidationError("payload must be a JSON object")

    terminal_id = raw.get("terminal_id")
    if terminal_id is not None and not isinstance(terminal_id, str):
        raise EventValidationError("terminal_id must be a string or null")

    validate_payload(event_type, payload)

    return {
        "schema_version": SCHEMA_VERSION,
        "host_id": host_id,
        "sequence_number": sequence_number,
        "type": event_type,
        "terminal_id": terminal_id,
        "wall_clock": wall_clock,
        "monotonic_ms": monotonic_ms,
        "payload": payload,
    }


def validate_payload(event_type: str, payload: dict[str, Any]) -> None:
    """Validate per-event-type payload required fields."""
    requirements = _PAYLOAD_REQUIREMENTS.get(event_type, ())
    for field, expected_type in requirements:
        if field not in payload:
            raise EventValidationError(
                f"{event_type} payload missing required field: {field}"
            )
        value = payload[field]
        if expected_type is int and isinstance(value, bool):
            raise EventValidationError(
                f"{event_type} payload field {field} must be int, not bool"
            )
        if not isinstance(value, expected_type):
            raise EventValidationError(
                f"{event_type} payload field {field} must be {expected_type.__name__}"
            )


_PAYLOAD_REQUIREMENTS: dict[str, tuple[tuple[str, type], ...]] = {
    "terminal.opened": (
        ("shell", str),
        ("cwd", str),
        ("pid", int),
        ("cols", int),
        ("rows", int),
    ),
    "terminal.bytes": (("byte_count", int), ("direction", str)),
    "terminal.cwd": (("cwd", str), ("source", str)),
    "terminal.prompt.start": (("prompt_sequence", int),),
    "terminal.command.start": (("prompt_sequence", int),),
    "terminal.command.end": (("prompt_sequence", int), ("exit_code", int)),
    "terminal.snapshot.write": (
        ("agent_name", str),
        ("byte_count", int),
        ("line_count", int),
        ("has_dimensions", bool),
    ),
    "terminal.snapshot.read": (
        ("agent_name", str),
        ("has_snapshot", bool),
        ("snapshot_age_ms", int),
    ),
    "terminal.attention_needed": (("reason", str),),
    "terminal.approval.actioned": (("agent_name", str), ("keys_length", int)),
    "terminal.approval.resolved": (("agent_name", str), ("pending_ms", int)),
    "terminal.exited": (("exit_code", int),),
    "terminal.closed": (("cleanup_result", str),),
    "runtime.events.dropped": (
        ("dropped_count", int),
        ("oldest_dropped_seq", int),
        ("newest_dropped_seq", int),
    ),
}
