"""Status and settings route registration."""

from __future__ import annotations

from fastapi import APIRouter


router = APIRouter()
_registered = False


def register_routes(main_module) -> None:
    global _registered
    if _registered:
        return
    router.add_api_route("/api/status", main_module.get_status, methods=["GET"])
    router.add_api_route("/api/runtime/ports", main_module.get_runtime_ports, methods=["GET"])
    router.add_api_route("/api/settings", main_module.get_settings, methods=["GET"])
    router.add_api_route("/api/version_check", main_module.version_check, methods=["GET"])
    _registered = True
