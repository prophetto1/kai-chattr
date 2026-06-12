"""WebSocket route registration and broadcast exports."""

from __future__ import annotations

from fastapi import APIRouter, WebSocket

from .main import (
    broadcast,
    broadcast_agents,
    broadcast_clear,
    broadcast_hats,
    broadcast_job,
    broadcast_locked,
    broadcast_rule,
    broadcast_schedule,
    broadcast_session,
    broadcast_settings,
    broadcast_status,
    broadcast_todo_update,
    broadcast_typing,
    websocket_endpoint,
)


router = APIRouter()
_registered = False


def register_routes(main_module) -> None:
    global _registered
    if _registered:
        return
    router.add_api_websocket_route("/ws", main_module.websocket_endpoint)
    router.add_api_websocket_route("/ws/terminals", _terminal_ws_dispatch)
    _registered = True


async def _terminal_ws_dispatch(websocket: WebSocket) -> None:
    # Resolve app.main at call time: the route is registered once per process,
    # but tests reload app.main; binding the live module keeps the session
    # token check and manager pointing at the active instance.
    import sys

    await sys.modules["app.main"].terminal_websocket_endpoint(websocket)
