"""Approval bridge decision logic (pure, no I/O).

Compares the previously stored snapshot state with an incoming snapshot and
decides which chat-card / audit actions the snapshot route must perform.
The route merges the returned ``state`` dict into the stored snapshot so the
next evaluation sees it.

Actions:
- ``("post_card", "approval", hint)`` — approval prompt appeared (false→true)
- ``("post_card", "stuck", "")`` — screen unchanged past ``stuck_ms`` with no
  approval pending; emitted once per stuck episode
- ``("resolved", pending_ms)`` — a pending approval cleared
"""

from __future__ import annotations

STUCK_MS = 20000

Action = tuple


def evaluate(
    prev: dict | None,
    new: dict,
    *,
    now: float,
    stuck_ms: int = STUCK_MS,
) -> dict:
    actions: list[Action] = []

    new_appr = bool(new.get("approval_needed"))
    prev_appr = bool(prev and prev.get("approval_needed"))
    text_changed = prev is None or prev.get("text") != new.get("text")

    last_change_at = now if text_changed else float(prev.get("last_change_at", now))
    stuck_notified = bool(prev.get("stuck_notified")) if prev else False
    approval_since = float(prev["approval_since"]) if prev and "approval_since" in prev else None

    if new_appr and not prev_appr:
        actions.append(("post_card", "approval", new.get("approval_hint", "")))
        approval_since = now
        stuck_notified = False
    elif not new_appr and prev_appr:
        pending_ms = int((now - (approval_since if approval_since is not None else now)) * 1000)
        actions.append(("resolved", pending_ms))
        approval_since = None

    if text_changed:
        stuck_notified = False
    elif (
        not new_appr
        and not stuck_notified
        and (now - last_change_at) * 1000 >= stuck_ms
    ):
        actions.append(("post_card", "stuck", ""))
        stuck_notified = True

    state: dict = {
        "last_change_at": last_change_at,
        "stuck_notified": stuck_notified,
    }
    if approval_since is not None:
        state["approval_since"] = approval_since
    return {"actions": actions, "state": state}
