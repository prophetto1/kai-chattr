"""System/operational routes (unprefixed): liveness + SQLite reachability probe."""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.db import db_ok
from app.logging_config import get_logger
from app.settings import settings

router = APIRouter(tags=["system"])
log = get_logger("app.api.system")


@router.get("/health")
def health() -> JSONResponse:
    ok = db_ok()
    if not ok:
        log.error("health.db.error", extra={"data": {"result": "db_unreachable"}})
        return JSONResponse(
            status_code=503,
            content={"error": {"code": "db_unreachable", "message": "SQLite probe failed"}},
        )
    return JSONResponse(
        status_code=200,
        content={
            "status": "ok",
            "service": settings.service_name,
            "version": settings.version,
            "db": "ok",
        },
    )
