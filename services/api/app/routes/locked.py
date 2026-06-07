"""Locked-item route registration."""

from __future__ import annotations

from fastapi import APIRouter


router = APIRouter()
_registered = False


def register_routes(main_module) -> None:
    global _registered
    if _registered:
        return
    router.add_api_route("/api/locked", main_module.get_locked, methods=["GET"])
    router.add_api_route("/api/locked", main_module.create_locked, methods=["POST"])
    router.add_api_route("/api/locked/{locked_id}", main_module.update_locked, methods=["PATCH"])
    router.add_api_route("/api/locked/{locked_id}", main_module.delete_locked, methods=["DELETE"])
    _registered = True
