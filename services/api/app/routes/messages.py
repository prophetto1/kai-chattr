"""Message and proposal route registration."""

from __future__ import annotations

from fastapi import APIRouter


router = APIRouter()
_registered = False


def register_routes(main_module) -> None:
    global _registered
    if _registered:
        return
    router.add_api_route("/api/messages", main_module.get_messages, methods=["GET"])
    router.add_api_route("/api/send", main_module.api_send, methods=["POST"])
    router.add_api_route(
        "/api/messages/{msg_id}/demote",
        main_module.demote_proposal,
        methods=["POST"],
    )
    router.add_api_route(
        "/api/messages/{msg_id}/resolve_decision",
        main_module.resolve_decision,
        methods=["POST"],
    )
    router.add_api_route(
        "/api/messages/{msg_id}/resolve_rule_proposal",
        main_module.resolve_rule_proposal,
        methods=["POST"],
    )
    router.add_api_route(
        "/api/messages/{msg_id}/demote_rule_proposal",
        main_module.demote_rule_proposal,
        methods=["POST"],
    )
    _registered = True
