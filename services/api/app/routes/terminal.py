from __future__ import annotations

import time
from dataclasses import dataclass
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

        snapshot = {
            "name": canonical_name,
            "text": _trim_terminal_text(text),
            "rows": body.get("rows"),
            "cols": body.get("cols"),
            "captured_at": body.get("captured_at") or time.time(),
            "received_at": time.time(),
        }
        with state.snapshots_lock:
            state.snapshots[canonical_name] = snapshot
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
