"""Lifecycle helpers for package callers and CLI startup."""

from __future__ import annotations

import asyncio
from collections.abc import Callable
from typing import Any


def configure(*args, **kwargs):
    from .main import configure as _configure

    return _configure(*args, **kwargs)


def set_event_loop(*args, **kwargs):
    from .main import set_event_loop as _set_event_loop

    return _set_event_loop(*args, **kwargs)


def register_cli_startup(app, *, set_loop: Callable[[asyncio.AbstractEventLoop], Any], get_session_engine):
    @app.on_event("startup")
    async def on_startup():
        set_loop(asyncio.get_running_loop())
        session_engine = get_session_engine()
        if session_engine:
            session_engine.resume_active_sessions()

    return on_startup
