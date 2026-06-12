"""SQLAlchemy-backed model-provider store."""

from __future__ import annotations

import threading
from typing import Any

from sqlalchemy import Boolean, Float, Integer, String, Text, UniqueConstraint, func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Mapped, mapped_column, sessionmaker

from app.database import create_database_engine, normalize_database_url
from app.stores.base import Base

MAX_NAME_CHARS = 120
MAX_PROVIDER_CHARS = 80
MAX_MODEL_CHARS = 120
MAX_URL_CHARS = 1024
MAX_KEY_ENV_CHARS = 120
MAX_CREATED_BY_CHARS = 120


def _trim_text(value: object, max_chars: int, *, required: bool = False) -> str | None:
    if value is None:
        return None if not required else ""
    text = str(value).strip()
    if not text:
        return None
    return text[:max_chars]


def _coerce_bool(value: object, *, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "t", "yes", "y", "on"}
    if value in (0, 1):
        return bool(value)
    return default


class ModelProvider(Base):
    __tablename__ = "model_providers"
    __table_args__ = (
        UniqueConstraint("name", name="uq_model_providers_name"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    uid: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(MAX_NAME_CHARS), unique=True, nullable=False)
    provider: Mapped[str] = mapped_column(String(MAX_PROVIDER_CHARS), nullable=False)
    model: Mapped[str] = mapped_column(String(MAX_MODEL_CHARS), nullable=False)
    base_url: Mapped[str] = mapped_column(String(MAX_URL_CHARS), nullable=False, default="")
    api_key_env: Mapped[str] = mapped_column(String(MAX_KEY_ENV_CHARS), nullable=False, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[float] = mapped_column(Float, nullable=False)
    updated_at: Mapped[float] = mapped_column(Float, nullable=False)
    created_by: Mapped[str] = mapped_column(String(MAX_CREATED_BY_CHARS), nullable=False)
    updated_by: Mapped[str] = mapped_column(String(MAX_CREATED_BY_CHARS), nullable=False)


class SqlAlchemyModelProviderStore:
    def __init__(self, database_url: str | Engine):
        if isinstance(database_url, Engine):
            self._engine = database_url
        else:
            url = normalize_database_url(database_url)
            if not url:
                raise ValueError("database_url is required")
            self._engine = create_database_engine(url)
        self._sessions = sessionmaker(
            bind=self._engine,
            autoflush=False,
            expire_on_commit=False,
            future=True,
        )
        if self._engine.url.get_backend_name() == "sqlite":
            Base.metadata.create_all(self._engine)
        self._lock = threading.Lock()
        self._callbacks: list = []

    def on_change(self, callback):
        self._callbacks.append(callback)

    def _fire(self, action: str, provider: dict[str, Any]):
        for cb in self._callbacks:
            try:
                cb(action, provider)
            except Exception:
                pass

    def _provider_dict(self, provider: ModelProvider) -> dict[str, Any]:
        return {
            "id": provider.id,
            "uid": provider.uid,
            "name": provider.name,
            "provider": provider.provider,
            "model": provider.model,
            "base_url": provider.base_url,
            "api_key_env": provider.api_key_env,
            "enabled": provider.enabled,
            "created_at": provider.created_at,
            "updated_at": provider.updated_at,
            "created_by": provider.created_by,
            "updated_by": provider.updated_by,
        }

    def _name_conflict(self, session, name: str, exclude_id: int | None = None) -> bool:
        stmt = select(ModelProvider).where(func.lower(ModelProvider.name) == name.lower())
        if exclude_id is not None:
            stmt = stmt.where(ModelProvider.id != exclude_id)
        return session.scalar(stmt) is not None

    def list_all(self, *, include_inactive: bool = True) -> list[dict[str, Any]]:
        with self._lock, self._sessions() as session:
            stmt = select(ModelProvider).order_by(ModelProvider.id)
            providers = session.scalars(stmt).all()
            items = [self._provider_dict(provider) for provider in providers]
        if not include_inactive:
            items = [item for item in items if bool(item.get("enabled", True))]
        return items

    def get(self, provider_id: int) -> dict[str, Any] | None:
        with self._lock, self._sessions() as session:
            provider = session.get(ModelProvider, provider_id)
            return self._provider_dict(provider) if provider else None

    def create(
        self,
        *,
        name: str,
        provider: str,
        model: str,
        base_url: str = "",
        api_key_env: str = "",
        enabled: bool = True,
        created_by: str = "user",
    ) -> dict[str, Any] | None:
        now = __import__("time").time()
        normalized = self._normalize_payload(
            {
                "name": name,
                "provider": provider,
                "model": model,
                "base_url": base_url,
                "api_key_env": api_key_env,
                "enabled": enabled,
                "created_by": created_by,
            }
        )
        if not normalized:
            return None
        with self._lock, self._sessions() as session:
            if self._name_conflict(session, normalized["name"]):
                return None
            provider_record = ModelProvider(
                uid=normalized["uid"],
                name=normalized["name"],
                provider=normalized["provider"],
                model=normalized["model"],
                base_url=normalized["base_url"],
                api_key_env=normalized["api_key_env"],
                enabled=normalized["enabled"],
                created_at=now,
                updated_at=now,
                created_by=normalized["created_by"],
                updated_by=normalized["updated_by"],
            )
            session.add(provider_record)
            session.commit()
            result = self._provider_dict(provider_record)
        self._fire("create", result)
        return result

    def update(
        self,
        provider_id: int,
        *,
        name: str | None = None,
        provider: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
        api_key_env: str | None = None,
        enabled: bool | None = None,
        updated_by: str = "user",
    ) -> dict[str, Any] | None:
        now = __import__("time").time()
        with self._lock, self._sessions() as session:
            provider_row = session.get(ModelProvider, provider_id)
            if provider_row is None:
                return None

            if name is not None:
                next_name = _trim_text(name, MAX_NAME_CHARS, required=True)
                if next_name is None:
                    return None
                if self._name_conflict(session, next_name, exclude_id=provider_id):
                    return None
                provider_row.name = next_name
            if provider is not None:
                next_provider = _trim_text(provider, MAX_PROVIDER_CHARS, required=True)
                if next_provider is None:
                    return None
                provider_row.provider = next_provider
            if model is not None:
                next_model = _trim_text(model, MAX_MODEL_CHARS, required=True)
                if next_model is None:
                    return None
                provider_row.model = next_model
            if base_url is not None:
                provider_row.base_url = _trim_text(base_url, MAX_URL_CHARS) or ""
            if api_key_env is not None:
                provider_row.api_key_env = _trim_text(api_key_env, MAX_KEY_ENV_CHARS) or ""
            if enabled is not None:
                provider_row.enabled = bool(_coerce_bool(enabled, default=provider_row.enabled))
            provider_row.updated_by = _trim_text(updated_by, MAX_CREATED_BY_CHARS) or provider_row.updated_by
            provider_row.updated_at = now
            session.commit()
            result = self._provider_dict(provider_row)
        self._fire("update", result)
        return result

    def delete(self, provider_id: int) -> dict[str, Any] | None:
        with self._lock, self._sessions() as session:
            provider_row = session.get(ModelProvider, provider_id)
            if provider_row is None:
                return None
            result = self._provider_dict(provider_row)
            session.delete(provider_row)
            session.commit()
        self._fire("delete", result)
        return result

    def _normalize_payload(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        name = _trim_text(payload.get("name"), MAX_NAME_CHARS, required=True)
        provider_name = _trim_text(payload.get("provider"), MAX_PROVIDER_CHARS, required=True)
        model = _trim_text(payload.get("model"), MAX_MODEL_CHARS, required=True)
        if name is None or provider_name is None or model is None:
            return None
        created_by = _trim_text(payload.get("created_by"), MAX_CREATED_BY_CHARS) or "user"
        updated_by = _trim_text(payload.get("updated_by"), MAX_CREATED_BY_CHARS) or created_by
        return {
            "uid": __import__("uuid").uuid4().__str__(),
            "name": name,
            "provider": provider_name,
            "model": model,
            "base_url": _trim_text(payload.get("base_url"), MAX_URL_CHARS) or "",
            "api_key_env": _trim_text(payload.get("api_key_env"), MAX_KEY_ENV_CHARS) or "",
            "enabled": _coerce_bool(payload.get("enabled", True), default=True),
            "created_by": created_by,
            "updated_by": updated_by,
        }
