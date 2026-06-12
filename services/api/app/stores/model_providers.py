"""Model-provider configuration store (file-backed runtime mode)."""

from __future__ import annotations

import json
import os
import threading
import time
import uuid
from pathlib import Path

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
    return bool(value) if value in (0, 1) else default


class ModelProviderStore:
    def __init__(self, path: str):
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._providers: list[dict] = []
        self._next_id = 1
        self._lock = threading.Lock()
        self._callbacks: list = []
        self._load()

    def _load(self):
        if not self._path.exists():
            return
        try:
            raw = json.loads(self._path.read_text("utf-8"))
        except Exception:
            raw = []
        if not isinstance(raw, list):
            raw = []
        self._providers = [item for item in raw if isinstance(item, dict)]
        max_id = 0
        for item in self._providers:
            try:
                max_id = max(max_id, int(item.get("id", 0)))
            except Exception:
                continue
        self._next_id = max_id + 1

    def _save(self):
        tmp = self._path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._providers, ensure_ascii=False), "utf-8")
        os.replace(tmp, self._path)

    def on_change(self, callback):
        self._callbacks.append(callback)

    def _fire(self, action: str, provider: dict):
        for cb in self._callbacks:
            try:
                cb(action, provider)
            except Exception:
                pass

    def _normalize(self, item: dict) -> dict:
        provider_name = _trim_text(item.get("provider"), MAX_PROVIDER_CHARS, required=True)
        model_name = _trim_text(item.get("model"), MAX_MODEL_CHARS, required=True)
        name = _trim_text(item.get("name"), MAX_NAME_CHARS, required=True)
        if provider_name is None or model_name is None or name is None:
            return {}
        return {
            "provider": provider_name,
            "model": model_name,
            "name": name,
            "base_url": _trim_text(item.get("base_url"), MAX_URL_CHARS) or "",
            "api_key_env": _trim_text(item.get("api_key_env"), MAX_KEY_ENV_CHARS) or "",
            "enabled": _coerce_bool(item.get("enabled", True), default=True),
        }

    def _name_conflict(self, name: str, exclude_id: int | None = None) -> bool:
        norm = name.strip().lower()
        for provider in self._providers:
            if exclude_id is not None and provider.get("id") == exclude_id:
                continue
            if str(provider.get("name", "")).strip().lower() == norm:
                return True
        return False

    def list_all(self, *, include_inactive: bool = True) -> list[dict]:
        with self._lock:
            items = [dict(item) for item in self._providers]
        if not include_inactive:
            items = [item for item in items if bool(item.get("enabled", True))]
        return items

    def get(self, provider_id: int) -> dict | None:
        with self._lock:
            for item in self._providers:
                if item["id"] == provider_id:
                    return dict(item)
        return None

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
    ) -> dict | None:
        now = time.time()
        normalized = self._normalize(
            {
                "name": name,
                "provider": provider,
                "model": model,
                "base_url": base_url,
                "api_key_env": api_key_env,
                "enabled": enabled,
            }
        )
        if not normalized:
            return None
        created_by_clean = _trim_text(created_by, MAX_CREATED_BY_CHARS) or "user"
        norm_name = normalized["name"]
        with self._lock:
            if self._name_conflict(norm_name):
                return None
            provider_record = {
                "id": self._next_id,
                "uid": str(uuid.uuid4()),
                "name": norm_name,
                "provider": normalized["provider"],
                "model": normalized["model"],
                "base_url": normalized["base_url"],
                "api_key_env": normalized["api_key_env"],
                "enabled": bool(normalized["enabled"]),
                "created_at": now,
                "updated_at": now,
                "created_by": created_by_clean,
                "updated_by": created_by_clean,
            }
            self._next_id += 1
            self._providers.append(provider_record)
            self._save()
            result = dict(provider_record)
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
    ) -> dict | None:
        now = time.time()
        with self._lock:
            for item in self._providers:
                if item["id"] != provider_id:
                    continue
                next_item: dict = dict(item)
                if name is not None:
                    next_name = _trim_text(name, MAX_NAME_CHARS, required=True)
                    if next_name is None:
                        return None
                    if self._name_conflict(next_name, exclude_id=provider_id):
                        return None
                    next_item["name"] = next_name
                if provider is not None:
                    next_provider = _trim_text(provider, MAX_PROVIDER_CHARS, required=True)
                    if next_provider is None:
                        return None
                    next_item["provider"] = next_provider
                if model is not None:
                    next_model = _trim_text(model, MAX_MODEL_CHARS, required=True)
                    if next_model is None:
                        return None
                    next_item["model"] = next_model
                if base_url is not None:
                    next_item["base_url"] = _trim_text(base_url, MAX_URL_CHARS) or ""
                if api_key_env is not None:
                    next_item["api_key_env"] = _trim_text(api_key_env, MAX_KEY_ENV_CHARS) or ""
                if enabled is not None:
                    next_item["enabled"] = bool(enabled)
                updater = _trim_text(updated_by, MAX_CREATED_BY_CHARS) or "user"
                next_item["updated_by"] = updater
                next_item["updated_at"] = now
                item.update(next_item)
                self._save()
                result = dict(item)
                break
            else:
                return None
        self._fire("update", result)
        return result

    def delete(self, provider_id: int) -> dict | None:
        with self._lock:
            for index, item in enumerate(self._providers):
                if item["id"] != provider_id:
                    continue
                deleted = self._providers.pop(index)
                self._save()
                result = dict(deleted)
                break
            else:
                return None
        self._fire("delete", result)
        return result
