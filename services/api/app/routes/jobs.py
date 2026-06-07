"""Job route registration."""

from __future__ import annotations

from fastapi import APIRouter


router = APIRouter()
_registered = False


def register_routes(main_module) -> None:
    global _registered
    if _registered:
        return
    router.add_api_route("/api/jobs", main_module.get_jobs, methods=["GET"])
    router.add_api_route("/api/jobs", main_module.create_job, methods=["POST"])
    router.add_api_route("/api/jobs/{job_id}", main_module.update_job, methods=["PATCH"])
    router.add_api_route("/api/jobs/reorder", main_module.reorder_jobs, methods=["POST"])
    router.add_api_route(
        "/api/jobs/{job_id}/messages",
        main_module.get_job_messages,
        methods=["GET"],
    )
    router.add_api_route(
        "/api/jobs/{job_id}/messages",
        main_module.post_job_message,
        methods=["POST"],
    )
    router.add_api_route(
        "/api/jobs/{job_id}/messages/{msg_id}",
        main_module.delete_job_message,
        methods=["DELETE"],
    )
    router.add_api_route(
        "/api/jobs/{job_id}/messages/{msg_index}/resolve",
        main_module.resolve_job_message,
        methods=["POST"],
    )
    router.add_api_route("/api/jobs/{job_id}", main_module.delete_job, methods=["DELETE"])
    _registered = True
