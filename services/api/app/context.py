"""Shared runtime state for the FastAPI backend package."""

from __future__ import annotations

from dataclasses import dataclass, field
import threading
from typing import Any

from fastapi import WebSocket


DEFAULT_ROOM_SETTINGS = {
    "title": "noname",
    "username": "user",
    "font": "sans",
    "channels": ["general"],
    "history_limit": "all",
    "contrast": "normal",
    "custom_roles": [],
    "default_mention": "none",
}


@dataclass
class RuntimeContext:
    """Mutable runtime substrate shared by lifecycle, routes, and MCP wiring."""

    store: Any = None
    rules: Any = None
    summaries: Any = None
    jobs: Any = None
    locked: Any = None
    schedules: Any = None
    router: Any = None
    agents: Any = None
    registry: Any = None
    session_store: Any = None
    session_engine: Any = None
    config: dict[str, Any] = field(default_factory=dict)
    ws_clients: set[WebSocket] = field(default_factory=set)
    terminal_snapshots: dict[str, dict] = field(default_factory=dict)
    terminal_snapshots_lock: threading.Lock = field(default_factory=threading.Lock)
    runtime_event_stream: Any = None
    event_loop: Any = None
    session_token_holder: list[str] = field(default_factory=lambda: [""])
    chattr_version: str = "unknown"
    room_settings: dict[str, Any] = field(
        default_factory=lambda: dict(DEFAULT_ROOM_SETTINGS)
    )
    agent_hats: dict[str, str] = field(default_factory=dict)
    security_middleware_installed: bool = False
    last_active_channel: str = "general"


runtime_context = RuntimeContext()


def get_runtime_context() -> RuntimeContext:
    return runtime_context
