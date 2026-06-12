"""Model provider route registration."""

from __future__ import annotations

from fastapi import APIRouter


router = APIRouter()
_registered = False


def register_routes(main_module) -> None:
    global _registered
    if _registered:
        return
    router.add_api_route("/api/model-providers", main_module.get_model_providers, methods=["GET"])
    router.add_api_route("/api/model-providers", main_module.create_model_provider, methods=["POST"])
    router.add_api_route(
        "/api/model-providers/{provider_id}",
        main_module.get_model_provider,
        methods=["GET"],
    )
    router.add_api_route(
        "/api/model-providers/{provider_id}",
        main_module.update_model_provider,
        methods=["PATCH"],
    )
    router.add_api_route(
        "/api/model-providers/{provider_id}",
        main_module.delete_model_provider,
        methods=["DELETE"],
    )
    _registered = True
