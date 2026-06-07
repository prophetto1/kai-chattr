"""Archive and upload route registration."""

from __future__ import annotations

from fastapi import APIRouter


router = APIRouter()
_registered = False


def register_routes(main_module) -> None:
    global _registered
    if _registered:
        return
    router.add_api_route("/api/upload", main_module.upload_image, methods=["POST"])
    router.add_api_route("/api/export", main_module.export_history, methods=["GET"])
    router.add_api_route("/api/import", main_module.import_history, methods=["POST"])
    router.add_api_route("/uploads/{filename}", main_module.serve_upload, methods=["GET"])
    _registered = True
