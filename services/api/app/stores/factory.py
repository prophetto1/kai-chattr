"""Store factories for API-owned persistence backends."""

from __future__ import annotations

from typing import Any

from app.database import database_settings
from app.stores.jobs import JobStore
from app.stores.jobs_db import SqlAlchemyJobStore
from app.stores.rules import RuleStore
from app.stores.rules_db import SqlAlchemyRuleStore


def create_rule_store(config: dict[str, Any], file_path: str) -> RuleStore | SqlAlchemyRuleStore:
    settings = database_settings(config)
    if settings.mode == "file":
        return RuleStore(file_path)
    if settings.mode == "postgres":
        return SqlAlchemyRuleStore(settings.url)
    raise ValueError(f"Unsupported database.mode={settings.mode!r}")


def create_job_store(config: dict[str, Any], file_path: str) -> JobStore | SqlAlchemyJobStore:
    settings = database_settings(config)
    if settings.mode == "file":
        return JobStore(file_path)
    if settings.mode == "postgres":
        return SqlAlchemyJobStore(settings.url)
    raise ValueError(f"Unsupported database.mode={settings.mode!r}")
