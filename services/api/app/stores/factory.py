"""Store factories for API-owned persistence backends."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.database import database_settings
from app.stores.model_providers import ModelProviderStore
from app.stores.home_start import HomeStartStore
from app.stores.home_start_db import SqlAlchemyHomeStartStore
from app.stores.identity_db import SqlAlchemyIdentityStore
from app.stores.jobs import JobStore
from app.stores.jobs_db import SqlAlchemyJobStore
from app.stores.routing_decisions_db import SqlAlchemyRoutingDecisionStore
from app.stores.rules import RuleStore
from app.stores.rules_db import SqlAlchemyRuleStore
from app.stores.model_providers_db import SqlAlchemyModelProviderStore


SERVICE_ROOT = Path(__file__).resolve().parents[2]


def _local_repository_roots(config: dict[str, Any]) -> list[str]:
    raw_roots = config.get("home", {}).get("local_repository_roots", [])
    if not isinstance(raw_roots, list):
        return []
    roots: list[str] = []
    for raw_root in raw_roots:
        if not isinstance(raw_root, str) or not raw_root.strip():
            continue
        root = Path(raw_root).expanduser()
        if not root.is_absolute():
            root = (SERVICE_ROOT / root).resolve()
        roots.append(str(root))
    return roots


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


def create_model_provider_store(
    config: dict[str, Any],
    file_path: str,
) -> ModelProviderStore | SqlAlchemyModelProviderStore:
    settings = database_settings(config)
    if settings.mode == "file":
        return ModelProviderStore(file_path)
    if settings.mode == "postgres":
        return SqlAlchemyModelProviderStore(settings.url)
    raise ValueError(f"Unsupported database.mode={settings.mode!r}")


def create_home_start_store(
    config: dict[str, Any],
    file_path: str,
) -> HomeStartStore | SqlAlchemyHomeStartStore:
    settings = database_settings(config)
    local_roots = _local_repository_roots(config)
    if settings.mode == "file":
        return HomeStartStore(file_path, local_repository_roots=local_roots)
    if settings.mode == "postgres":
        return SqlAlchemyHomeStartStore(settings.url, local_repository_roots=local_roots)
    raise ValueError(f"Unsupported database.mode={settings.mode!r}")


def create_routing_decision_store(config: dict[str, Any]) -> SqlAlchemyRoutingDecisionStore | None:
    settings = database_settings(config)
    if settings.mode == "file":
        return None
    if settings.mode == "postgres":
        return SqlAlchemyRoutingDecisionStore(settings.url)
    raise ValueError(f"Unsupported database.mode={settings.mode!r}")


def create_identity_store(config: dict[str, Any]) -> SqlAlchemyIdentityStore | None:
    """Identity/auth is postgres-only; file mode has no identity store
    (auth endpoints answer 503 rather than falling back to a stub)."""
    settings = database_settings(config)
    if settings.mode == "file":
        return None
    if settings.mode == "postgres":
        return SqlAlchemyIdentityStore(settings.url)
    raise ValueError(f"Unsupported database.mode={settings.mode!r}")
