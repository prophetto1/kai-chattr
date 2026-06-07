"""Session route registration."""

from __future__ import annotations

from fastapi import APIRouter


router = APIRouter()
_registered = False


def register_routes(main_module) -> None:
    global _registered
    if _registered:
        return
    router.add_api_route("/api/sessions/templates", main_module.get_session_templates, methods=["GET"])
    router.add_api_route("/api/sessions/active", main_module.get_active_session, methods=["GET"])
    router.add_api_route("/api/sessions/active-all", main_module.get_all_active_sessions, methods=["GET"])
    router.add_api_route("/api/sessions/start", main_module.start_session, methods=["POST"])
    router.add_api_route("/api/sessions/{session_id}/end", main_module.end_session, methods=["POST"])
    router.add_api_route("/api/sessions/request-draft", main_module.request_session_draft, methods=["POST"])
    router.add_api_route("/api/sessions/save-draft", main_module.save_draft, methods=["POST"])
    router.add_api_route(
        "/api/sessions/templates/{template_id}",
        main_module.delete_session_template,
        methods=["DELETE"],
    )
    _registered = True
