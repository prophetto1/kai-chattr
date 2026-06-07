"""Role route registration."""

from __future__ import annotations

from fastapi import APIRouter


router = APIRouter()
_registered = False


def register_routes(main_module) -> None:
    global _registered
    if _registered:
        return
    router.add_api_route("/api/roles", main_module.get_roles, methods=["GET"])
    router.add_api_route("/api/roles/{agent_name}", main_module.set_agent_role, methods=["POST"])
    _registered = True
