"""Rule route registration."""

from __future__ import annotations

from fastapi import APIRouter


router = APIRouter()
_registered = False


def register_routes(main_module) -> None:
    global _registered
    if _registered:
        return
    router.add_api_route("/api/rules", main_module.get_rules, methods=["GET"])
    router.add_api_route("/api/rules", main_module.create_rule, methods=["POST"])
    router.add_api_route("/api/rules/active", main_module.get_active_rules, methods=["GET"])
    router.add_api_route("/api/rules/remind", main_module.remind_agents, methods=["POST"])
    router.add_api_route(
        "/api/rules/agent_sync/{agent_name}",
        main_module.report_rule_sync,
        methods=["POST"],
    )
    router.add_api_route("/api/rules/freshness", main_module.get_rules_freshness, methods=["GET"])
    router.add_api_route("/api/rules/{rule_id}", main_module.update_rule, methods=["PATCH"])
    router.add_api_route("/api/rules/{rule_id}", main_module.delete_rule, methods=["DELETE"])
    _registered = True
