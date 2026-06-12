from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, MutableMapping

from fastapi import APIRouter
from fastapi.requests import Request
from fastapi.responses import JSONResponse


@dataclass(frozen=True)
class TerminalApiState:
    snapshots: MutableMapping[str, dict]
    snapshots_lock: Any
    get_registry: Callable[[], Any]
    resolve_authenticated_agent: Callable[[Request], dict | None]
    extract_agent_token: Callable[[Request], str]
    get_event_stream: Callable[[], Any | None]
    get_data_dir: Callable[[], str] = lambda: "./data"


# Crude approval-prompt detection on snapshot text (Jon's spec: heuristic is
# fine — its only job is "such exists"). Patterns cover the common provider
# CLI confirmation shapes (Claude Code, Codex, Gemini).
APPROVAL_PATTERNS: tuple[re.Pattern, ...] = (
    re.compile(r"Do you want", re.IGNORECASE),
    re.compile(r"\b(?:y/n|yes/no)\b", re.IGNORECASE),
    re.compile(r"\bAllow\b.*\?", re.IGNORECASE),
    re.compile(r"❯\s*1\."),
    re.compile(r"^\s*1\.\s*Yes\b", re.MULTILINE),
    re.compile(r"Press Enter to (?:continue|confirm)", re.IGNORECASE),
    re.compile(r"\bProceed\b.*\?", re.IGNORECASE),
)

# Only the freshest part of the screen counts — old prompts scrolled into
# history must not re-flag.
_APPROVAL_SCAN_LINES = 25


def detect_approval(text: str) -> tuple[bool, str]:
    """Return (approval_needed, matching_line) for a snapshot's screen text."""
    tail_lines = text.splitlines()[-_APPROVAL_SCAN_LINES:]
    tail = "\n".join(tail_lines)
    for pattern in APPROVAL_PATTERNS:
        match = pattern.search(tail)
        if match:
            for line in tail_lines:
                if pattern.search(line):
                    return True, line.strip()[:200]
            return True, match.group(0)[:200]
    return False, ""


def _trim_terminal_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")
    if len(lines) > 160:
        lines = lines[-160:]
    lines = [line[:500] for line in lines]
    text = "\n".join(lines)
    if len(text) > 50000:
        text = text[-50000:]
    return text


def _terminal_snapshot_age_ms(snapshot: dict | None) -> int:
    if not snapshot:
        return 0
    try:
        received_at = float(snapshot.get("received_at") or 0)
    except (TypeError, ValueError):
        return 0
    if received_at <= 0:
        return 0
    return max(0, int((time.time() - received_at) * 1000))


def _append_runtime_event(state: TerminalApiState, event_type: str, *, actor: str, details: dict) -> None:
    stream = state.get_event_stream()
    if stream is None:
        return
    try:
        stream.append({
            "event_type": event_type,
            "source": "terminal-api",
            "actor": actor,
            "details": details,
        })
    except Exception:
        # Terminal telemetry must not break wrapper snapshot delivery or UI reads.
        return


def create_terminal_router(state: TerminalApiState) -> APIRouter:
    router = APIRouter(tags=["terminal"])

    @router.post("/api/terminal/{agent_name}")
    async def post_terminal_snapshot(agent_name: str, request: Request):
        """Wrapper reports its current visible terminal buffer."""
        auth_inst = state.resolve_authenticated_agent(request)
        presented_token = state.extract_agent_token(request)
        if presented_token and not auth_inst:
            return JSONResponse({"error": "stale_session"}, status_code=409)
        if not auth_inst:
            return JSONResponse({"error": "authenticated agent session required"}, status_code=403)

        canonical_name = auth_inst["name"]
        registry = state.get_registry()
        if registry:
            resolved = registry.resolve_name(agent_name)
            if resolved != canonical_name:
                return JSONResponse({"error": "token does not match requested agent"}, status_code=403)

        try:
            body = await request.json()
        except Exception:
            return JSONResponse({"error": "invalid JSON"}, status_code=400)

        text = body.get("text", "")
        if not isinstance(text, str):
            return JSONResponse({"error": "text must be a string"}, status_code=400)

        trimmed = _trim_terminal_text(text)
        approval_needed, approval_hint = detect_approval(trimmed)
        snapshot = {
            "name": canonical_name,
            "text": trimmed,
            "rows": body.get("rows"),
            "cols": body.get("cols"),
            "captured_at": body.get("captured_at") or time.time(),
            "received_at": time.time(),
            "approval_needed": approval_needed,
            "approval_hint": approval_hint,
        }
        with state.snapshots_lock:
            previous = state.snapshots.get(canonical_name)
            state.snapshots[canonical_name] = snapshot
        if approval_needed and not (previous or {}).get("approval_needed"):
            _append_runtime_event(
                state,
                "terminal.attention_needed",
                actor=canonical_name,
                details={"reason": "approval_prompt_detected"},
            )
        _append_runtime_event(
            state,
            "terminal.snapshot.write",
            actor=canonical_name,
            details={
                "agent_name": canonical_name,
                "byte_count": len(snapshot["text"].encode("utf-8")),
                "line_count": len(snapshot["text"].splitlines()),
                "has_dimensions": isinstance(snapshot.get("rows"), int)
                and isinstance(snapshot.get("cols"), int),
            },
        )
        return JSONResponse({"ok": True, "name": canonical_name})

    @router.get("/api/terminal-runtimes")
    async def list_terminal_runtimes():
        """Runtime card data: one entry per agent with a reported screen."""
        registry = state.get_registry()
        known = set(registry.get_all_names()) if registry else set()
        with state.snapshots_lock:
            snapshots = {name: dict(snap) for name, snap in state.snapshots.items()}

        agents = []
        for name in sorted(known | set(snapshots)):
            snapshot = snapshots.get(name)
            tail = ""
            if snapshot:
                tail = "\n".join(snapshot.get("text", "").splitlines()[-25:])
            agents.append({
                "name": name,
                "registered": name in known,
                "has_snapshot": snapshot is not None,
                "snapshot_age_ms": _terminal_snapshot_age_ms(snapshot),
                "approval_needed": bool((snapshot or {}).get("approval_needed")),
                "approval_hint": (snapshot or {}).get("approval_hint", ""),
                "screen_tail": tail,
            })
        return JSONResponse({
            "ok": True,
            "agents": agents,
            "pending_approvals": sum(1 for a in agents if a["approval_needed"]),
        })

    @router.post("/api/terminal/{agent_name}/input")
    async def post_terminal_input(agent_name: str, request: Request):
        """Human-facing raw keystroke lane: appends to the agent's input queue
        file, which the wrapper drains verbatim into the PTY (text + Enter).
        Session-gated by the default /api middleware — no agent token here.
        """
        registry = state.get_registry()
        canonical_name = registry.resolve_name(agent_name) if registry else agent_name
        known = set(registry.get_all_names()) if registry else set()
        if canonical_name not in known:
            return JSONResponse({"error": f"unknown agent {agent_name!r}"}, status_code=404)

        try:
            body = await request.json()
        except Exception:
            return JSONResponse({"error": "invalid JSON"}, status_code=400)
        keys = body.get("keys", "")
        if not isinstance(keys, str) or len(keys) > 200:
            return JSONResponse({"error": "keys must be a string (max 200 chars)"}, status_code=400)

        input_file = Path(state.get_data_dir()) / f"{canonical_name}_input.jsonl"
        input_file.parent.mkdir(parents=True, exist_ok=True)
        with input_file.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps({"keys": keys}) + "\n")

        _append_runtime_event(
            state,
            "terminal.bytes",
            actor="browser",
            details={"byte_count": len(keys.encode("utf-8")), "direction": "in"},
        )
        return JSONResponse({"ok": True, "name": canonical_name})

    @router.get("/api/terminal/{agent_name}")
    async def get_terminal_snapshot(agent_name: str):
        registry = state.get_registry()
        canonical_name = registry.resolve_name(agent_name) if registry else agent_name
        with state.snapshots_lock:
            snapshot = state.snapshots.get(canonical_name)
            if snapshot:
                snapshot = dict(snapshot)
        _append_runtime_event(
            state,
            "terminal.snapshot.read",
            actor="browser",
            details={
                "agent_name": canonical_name,
                "has_snapshot": snapshot is not None,
                "snapshot_age_ms": _terminal_snapshot_age_ms(snapshot),
            },
        )
        return JSONResponse({
            "ok": True,
            "name": canonical_name,
            "snapshot": snapshot,
        })

    return router
