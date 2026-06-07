"""Agent registration route registration."""

from __future__ import annotations

from fastapi import APIRouter


router = APIRouter()
_registered = False


def register_routes(main_module) -> None:
    global _registered
    if _registered:
        return
    router.add_api_route("/api/trigger-agent", main_module.trigger_agent_silent, methods=["POST"])
    router.add_api_route("/api/register", main_module.register_agent, methods=["POST"])
    router.add_api_route("/api/deregister/{name}", main_module.deregister_agent, methods=["POST"])
    router.add_api_route("/api/poll/{agent_name}", main_module.poll_agent_queue, methods=["GET"])
    router.add_api_route("/api/label/{name}", main_module.rename_agent_label, methods=["POST"])
    router.add_api_route("/api/heartbeat/{agent_name}", main_module.heartbeat, methods=["POST"])
    _registered = True
