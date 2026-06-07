"""Agent hat route registration."""

from __future__ import annotations

from fastapi import APIRouter


router = APIRouter()
_registered = False


def register_routes(main_module) -> None:
    global _registered
    if _registered:
        return
    router.add_api_route("/api/hat/{agent_name}", main_module.delete_hat, methods=["DELETE"])
    _registered = True
