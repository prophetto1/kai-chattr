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
