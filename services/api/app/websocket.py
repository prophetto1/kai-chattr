"""WebSocket route registration and broadcast exports."""

from __future__ import annotations

from fastapi import APIRouter

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
    _registered = True
