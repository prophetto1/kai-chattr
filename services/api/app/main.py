"""FastAPI app factory for kai-chattr-api.

The relocatable agent runtime: its only interface is this typed-HTTP + WebSocket
surface; it owns its SQLite (created at startup). Routes live in `app/api/` and
are registered here; system routes are unprefixed, product routes (later) mount
under `/v1`.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api import system, ws
from app.db import init_db
from app.logging_config import configure_logging, get_logger
from app.settings import settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging(settings.log_level)
    init_db()
    get_logger("app.main").info(
        "service.startup",
        extra={
            "data": {
                "service": settings.service_name,
                "version": settings.version,
                "port": settings.port,
                "db_configured": bool(settings.db_path),
            }
        },
    )
    yield


def create_app() -> FastAPI:
    application = FastAPI(
        title=settings.service_name,
        version=settings.version,
        lifespan=lifespan,
    )
    application.include_router(system.router)
    application.include_router(ws.router)
    return application


app = create_app()
