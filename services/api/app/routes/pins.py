"""Pinned-message route registration."""

from __future__ import annotations

from fastapi import APIRouter


router = APIRouter()
_registered = False


def register_routes(main_module) -> None:
    global _registered
    if _registered:
        return
    router.add_api_route("/api/pins", main_module.get_pins, methods=["GET"])
    router.add_api_route("/api/pins", main_module.create_pin, methods=["POST"])
    router.add_api_route("/api/pins", main_module.clear_pins, methods=["DELETE"])
    router.add_api_route("/api/pins/{message_id}", main_module.update_pin, methods=["PATCH"])
    router.add_api_route("/api/pins/{message_id}", main_module.delete_pin, methods=["DELETE"])
    _registered = True
