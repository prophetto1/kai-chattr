"""Database configuration helpers for kai-chattr API-owned persistence."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import sqlalchemy
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker


DATABASE_URL_ENV = "KAI_CHATTR_DATABASE_URL"
MIGRATION_DATABASE_URL_ENV = "KAI_CHATTR_MIGRATION_DATABASE_URL"
_SQLALCHEMY_INSTRUMENTED = False


class DatabaseConfigurationError(RuntimeError):
    """Raised when database mode is enabled without a usable URL."""


@dataclass(frozen=True)
class DatabaseSettings:
    mode: str
    url: str | None


def database_settings(config: dict[str, Any]) -> DatabaseSettings:
    database = config.get("database", {})
    mode = str(database.get("mode", "file") or "file").strip().lower()
    url = str(database.get("url", "") or "").strip() or None
    if mode == "postgres" and not url:
        raise DatabaseConfigurationError(
            f"database.mode=postgres requires {DATABASE_URL_ENV} or database.url"
        )
    return DatabaseSettings(mode=mode, url=normalize_database_url(url) if url else None)


def normalize_database_url(url: str | None) -> str | None:
    if not url:
        return None
    if url.startswith("postgres://"):
        return "postgresql+psycopg2://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        return "postgresql+psycopg2://" + url[len("postgresql://") :]
    return url


def create_database_engine(config: dict[str, Any] | str) -> Engine:
    url = normalize_database_url(config) if isinstance(config, str) else database_settings(config).url
    if not url:
        raise DatabaseConfigurationError(f"{DATABASE_URL_ENV} is not configured")
    configure_sqlalchemy_instrumentation()
    return sqlalchemy.create_engine(url, pool_pre_ping=True, future=True)


def create_session_factory(config: dict[str, Any] | str) -> sessionmaker:
    return sessionmaker(bind=create_database_engine(config), autoflush=False, expire_on_commit=False)


def configure_sqlalchemy_instrumentation() -> None:
    global _SQLALCHEMY_INSTRUMENTED
    if _SQLALCHEMY_INSTRUMENTED:
        return
    SQLAlchemyInstrumentor().instrument()
    _SQLALCHEMY_INSTRUMENTED = True


def check_database(engine: Engine) -> bool:
    with engine.connect() as connection:
        connection.execute(text("select 1"))
    return True
