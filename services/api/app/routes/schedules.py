"""Schedule route registration."""

from __future__ import annotations

from fastapi import APIRouter


router = APIRouter()
_registered = False


def register_routes(main_module) -> None:
    global _registered
    if _registered:
        return
    router.add_api_route("/api/schedules", main_module.get_schedules, methods=["GET"])
    router.add_api_route("/api/schedules", main_module.create_schedule, methods=["POST"])
    router.add_api_route(
        "/api/schedules/{schedule_id}",
        main_module.delete_schedule,
        methods=["DELETE"],
    )
    router.add_api_route(
        "/api/schedules/{schedule_id}/toggle",
        main_module.toggle_schedule,
        methods=["PATCH"],
    )
    _registered = True
