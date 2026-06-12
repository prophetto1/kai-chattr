"""Pure decision tests for the approval bridge (plan: Phase A, Task 2).

evaluate(prev, new, now=..., stuck_ms=...) compares the previously stored
snapshot state with the incoming one and returns chat-card / event actions
plus the derived tracking state the route merges into the stored snapshot.
No I/O.
"""

from __future__ import annotations

from app.terminal.approval_bridge import evaluate


def snap(text: str = "screen", *, approval: bool = False, hint: str = "", **state):
    s = {"text": text, "approval_needed": approval, "approval_hint": hint}
    s.update(state)
    return s


def actions(result):
    return result["actions"]


def state(result):
    return result["state"]


def test_first_snapshot_no_actions():
    r = evaluate(None, snap("boot"), now=100.0)
    assert actions(r) == []
    assert state(r)["last_change_at"] == 100.0
    assert state(r)["stuck_notified"] is False


def test_approval_transition_posts_card():
    prev = snap("idle", last_change_at=90.0, stuck_notified=False)
    new = snap("Do you want to proceed?", approval=True, hint="Do you want to proceed?")
    r = evaluate(prev, new, now=100.0)
    assert ("post_card", "approval", "Do you want to proceed?") in actions(r)
    assert state(r)["approval_since"] == 100.0


def test_persisting_approval_no_second_card():
    prev = snap("prompt", approval=True, hint="h", last_change_at=90.0,
                stuck_notified=False, approval_since=95.0)
    new = snap("prompt", approval=True, hint="h")
    r = evaluate(prev, new, now=100.0)
    assert actions(r) == []
    assert state(r)["approval_since"] == 95.0


def test_clearing_emits_resolved_with_pending_ms():
    prev = snap("prompt", approval=True, hint="h", last_change_at=90.0,
                stuck_notified=False, approval_since=95.0)
    new = snap("done")
    r = evaluate(prev, new, now=100.0)
    assert ("resolved", 5000) in actions(r)


def test_refire_after_clear_posts_again():
    prev = snap("working", last_change_at=99.0, stuck_notified=False)
    new = snap("Allow this?", approval=True, hint="Allow this?")
    r = evaluate(prev, new, now=120.0)
    assert ("post_card", "approval", "Allow this?") in actions(r)


def test_stuck_posts_once():
    prev = snap("frozen", last_change_at=70.0, stuck_notified=False)
    new = snap("frozen")  # unchanged text, no approval
    r = evaluate(prev, new, now=100.0, stuck_ms=20000)
    assert ("post_card", "stuck", "") in actions(r)
    assert state(r)["stuck_notified"] is True

    # next unchanged snapshot: no repeat
    prev2 = snap("frozen", **state(r))
    r2 = evaluate(prev2, snap("frozen"), now=110.0, stuck_ms=20000)
    assert actions(r2) == []


def test_text_change_resets_stuck_tracking():
    prev = snap("frozen", last_change_at=70.0, stuck_notified=True)
    r = evaluate(prev, snap("moving again"), now=100.0, stuck_ms=20000)
    assert actions(r) == []
    assert state(r)["last_change_at"] == 100.0
    assert state(r)["stuck_notified"] is False


def test_no_stuck_while_approval_pending():
    prev = snap("prompt", approval=True, hint="h", last_change_at=70.0,
                stuck_notified=False, approval_since=70.0)
    new = snap("prompt", approval=True, hint="h")
    r = evaluate(prev, new, now=100.0, stuck_ms=20000)
    assert actions(r) == []  # approval card already covers attention


# --- Route-level: snapshot POST drives card posting (plan Task 3) ---

import threading

from fastapi import FastAPI
from fastapi.testclient import TestClient

APPROVAL_SCREEN = "Tool use\n\n Do you want to proceed?\n ❯ 1. Yes\n   2. No\n"
CLEARED_SCREEN = "done.\n❯\n"


class _FakeRegistry:
    def __init__(self, names):
        self._names = list(names)

    def get_all_names(self):
        return list(self._names)

    def resolve_name(self, name):
        return name


def _make_state(tmp_path, posted: list | None):
    from app.routes.terminal import TerminalApiState

    kwargs = dict(
        snapshots={},
        snapshots_lock=threading.Lock(),
        get_registry=lambda: _FakeRegistry(["claude"]),
        resolve_authenticated_agent=lambda request: {"name": "claude"},
        extract_agent_token=lambda request: "agent-token",
        get_event_stream=lambda: None,
        get_data_dir=lambda: str(tmp_path),
    )
    if posted is not None:
        kwargs["post_chat_message"] = lambda **kw: posted.append(kw)
    return TerminalApiState(**kwargs)


def _client(state):
    from app.routes.terminal import create_terminal_router

    app = FastAPI()
    app.include_router(create_terminal_router(state))
    return TestClient(app)


def test_snapshot_transition_posts_one_card(tmp_path):
    posted: list = []
    client = _client(_make_state(tmp_path, posted))

    r = client.post("/api/terminal/claude", json={"text": APPROVAL_SCREEN})
    assert r.status_code == 200
    assert len(posted) == 1
    card = posted[0]
    assert card["sender"] == "claude"
    assert card["msg_type"] == "approval_card"
    assert card["channel"] == "general"
    assert "claude" in card["text"]
    meta = card["metadata"]
    assert meta["card"] == "agent_attention.v1"
    assert meta["agent"] == "claude"
    assert meta["reason"] == "approval"
    assert meta["hint"]
    assert isinstance(meta["detected_at"], float)

    # same prompt again: no second card
    client.post("/api/terminal/claude", json={"text": APPROVAL_SCREEN})
    assert len(posted) == 1

    # cleared screen: no card
    client.post("/api/terminal/claude", json={"text": CLEARED_SCREEN})
    assert len(posted) == 1

    # re-fire after clear: second card
    client.post("/api/terminal/claude", json={"text": APPROVAL_SCREEN})
    assert len(posted) == 2


def test_snapshot_route_works_without_post_chat_message(tmp_path):
    client = _client(_make_state(tmp_path, None))
    r = client.post("/api/terminal/claude", json={"text": APPROVAL_SCREEN})
    assert r.status_code == 200
    r = client.post("/api/terminal/claude", json={"text": CLEARED_SCREEN})
    assert r.status_code == 200


# --- R-B audit events: schema + emission (plan Task 5) ---

class _Stream:
    def __init__(self):
        self.events: list[dict] = []

    def append(self, event: dict) -> None:
        self.events.append(event)


def _envelope(event_type: str, payload: dict) -> dict:
    return {
        "host_id": "test-host",
        "sequence_number": 1,
        "type": event_type,
        "wall_clock": "2026-06-12T12:00:00Z",
        "monotonic_ms": 1,
        "payload": payload,
    }


def test_approval_audit_event_types_validate():
    from app.events.terminal_event_schema import validate_envelope

    validate_envelope(_envelope(
        "terminal.approval.actioned", {"agent_name": "claude", "keys_length": 1}
    ))
    validate_envelope(_envelope(
        "terminal.approval.resolved", {"agent_name": "claude", "pending_ms": 5000}
    ))


def test_unknown_event_type_still_rejected():
    import pytest as _pytest

    from app.events.terminal_event_schema import EventValidationError, validate_envelope

    with _pytest.raises(EventValidationError):
        validate_envelope(_envelope("terminal.approval.bogus", {}))


def _make_state_with_stream(tmp_path, posted: list, stream: _Stream):
    from app.routes.terminal import TerminalApiState

    return TerminalApiState(
        snapshots={},
        snapshots_lock=threading.Lock(),
        get_registry=lambda: _FakeRegistry(["claude"]),
        resolve_authenticated_agent=lambda request: {"name": "claude"},
        extract_agent_token=lambda request: "agent-token",
        get_event_stream=lambda: stream,
        get_data_dir=lambda: str(tmp_path),
        post_chat_message=lambda **kw: posted.append(kw),
    )


def test_actioned_and_resolved_events_emitted(tmp_path):
    stream = _Stream()
    state = _make_state_with_stream(tmp_path, [], stream)
    client = _client(state)

    client.post("/api/terminal/claude", json={"text": APPROVAL_SCREEN})
    client.post("/api/terminal/claude/input", json={"keys": "1"})
    actioned = [e for e in stream.events if e["event_type"] == "terminal.approval.actioned"]
    assert len(actioned) == 1
    assert actioned[0]["details"] == {"agent_name": "claude", "keys_length": 1}

    client.post("/api/terminal/claude", json={"text": CLEARED_SCREEN})
    resolved = [e for e in stream.events if e["event_type"] == "terminal.approval.resolved"]
    assert len(resolved) == 1
    assert resolved[0]["details"]["agent_name"] == "claude"
    assert isinstance(resolved[0]["details"]["pending_ms"], int)


def test_no_actioned_event_without_pending_approval(tmp_path):
    stream = _Stream()
    state = _make_state_with_stream(tmp_path, [], stream)
    client = _client(state)

    client.post("/api/terminal/claude", json={"text": "calm screen\n"})
    client.post("/api/terminal/claude/input", json={"keys": "x"})
    assert not [e for e in stream.events if e["event_type"] == "terminal.approval.actioned"]


# --- Runtimes endpoint: last_change_ms + stuck (plan Task 4) ---

def test_runtimes_reports_last_change_and_stuck(tmp_path):
    posted: list = []
    state = _make_state(tmp_path, posted)
    client = _client(state)

    client.post("/api/terminal/claude", json={"text": "working...\n"})
    agent = client.get("/api/terminal-runtimes").json()["agents"][0]
    assert agent["last_change_ms"] < 5000
    assert agent["stuck"] is False

    # age the last screen change past STUCK_MS
    with state.snapshots_lock:
        state.snapshots["claude"]["last_change_at"] -= 25.0
    agent = client.get("/api/terminal-runtimes").json()["agents"][0]
    assert agent["last_change_ms"] >= 20000
    assert agent["stuck"] is True


def test_no_stuck_flag_while_approval_pending(tmp_path):
    state = _make_state(tmp_path, [])
    client = _client(state)
    client.post("/api/terminal/claude", json={"text": APPROVAL_SCREEN})
    with state.snapshots_lock:
        state.snapshots["claude"]["last_change_at"] -= 25.0
    agent = client.get("/api/terminal-runtimes").json()["agents"][0]
    assert agent["approval_needed"] is True
    assert agent["stuck"] is False


def test_stuck_posts_card_once_via_route(tmp_path):
    posted: list = []
    state = _make_state(tmp_path, posted)
    client = _client(state)

    client.post("/api/terminal/claude", json={"text": "frozen screen\n"})
    assert posted == []
    with state.snapshots_lock:
        state.snapshots["claude"]["last_change_at"] -= 25.0

    # same text again: bridge sees unchanged screen past stuck_ms
    client.post("/api/terminal/claude", json={"text": "frozen screen\n"})
    assert len(posted) == 1
    assert posted[0]["metadata"]["reason"] == "stuck"

    # and only once per episode
    with state.snapshots_lock:
        state.snapshots["claude"]["last_change_at"] -= 25.0
    client.post("/api/terminal/claude", json={"text": "frozen screen\n"})
    assert len(posted) == 1
