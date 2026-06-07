"""Right-rail route registration."""

from __future__ import annotations

from fastapi import APIRouter


router = APIRouter()
_registered = False


def register_routes(main_module) -> None:
    global _registered
    if _registered:
        return
    router.add_api_route("/api/mcp/tools", main_module.get_mcp_tools, methods=["GET"])
    router.add_api_route(
        "/api/right-rail/capabilities",
        main_module.get_right_rail_capabilities,
        methods=["GET"],
    )
    _registered = True
