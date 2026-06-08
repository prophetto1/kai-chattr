"""Status and settings route registration."""

from __future__ import annotations

from fastapi import APIRouter


router = APIRouter()
_registered = False


def register_routes(main_module) -> None:
    global _registered
    if _registered:
        return
    # Runtime port metadata is intentionally public; the browser uses it to
    # verify the app/API/MCP topology without exposing the session token.
    router.add_api_route("/healthz", main_module.healthz, methods=["GET"])
    router.add_api_route("/api/status", main_module.get_status, methods=["GET"])
    router.add_api_route("/api/runtime/ports", main_module.get_runtime_ports, methods=["GET"])
    router.add_api_route("/api/settings", main_module.get_settings, methods=["GET"])
    router.add_api_route("/api/settings", main_module.patch_settings, methods=["PATCH"])
    router.add_api_route("/api/themes", main_module.get_themes, methods=["GET"])
    router.add_api_route("/api/version_check", main_module.version_check, methods=["GET"])
    _registered = True
