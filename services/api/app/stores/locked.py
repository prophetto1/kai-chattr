"""Persistent store for right-rail locked notes.

Locked items are durable coordination records that should remain visible to
humans and agents until explicitly archived or deleted.
"""

from __future__ import annotations

import json
import os
import threading
import time
import uuid
from pathlib import Path

MAX_LOCKED_TEXT_CHARS = 500
MAX_LOCKED_REASON_CHARS = 500


class LockedStore:
    def __init__(self, path: str):
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._items: list[dict] = []
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
        self._items = [item for item in raw if isinstance(item, dict)]
        max_id = 0
        for item in self._items:
            try:
                max_id = max(max_id, int(item.get("id", 0)))
            except Exception:
                continue
        self._next_id = max_id + 1

    def _save(self):
        tmp = self._path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self._items, ensure_ascii=False), "utf-8")
        os.replace(tmp, self._path)

    def on_change(self, callback):
        self._callbacks.append(callback)

    def _fire(self, action: str, item: dict):
        for cb in self._callbacks:
            try:
                cb(action, item)
            except Exception:
                pass

    def list_all(self, status: str | None = None) -> list[dict]:
        with self._lock:
            items = [dict(item) for item in self._items]
        if status:
            items = [item for item in items if item.get("status") == status]
        return items

    def get(self, locked_id: int) -> dict | None:
        with self._lock:
            for item in self._items:
                if item["id"] == locked_id:
                    return dict(item)
        return None

    def create(self, text: str, created_by: str, reason: str = "") -> dict | None:
        text = text.strip()[:MAX_LOCKED_TEXT_CHARS]
        reason = reason.strip()[:MAX_LOCKED_REASON_CHARS]
        if not text:
            return None
        now = time.time()
        with self._lock:
            item = {
                "id": self._next_id,
                "uid": str(uuid.uuid4()),
                "text": text,
                "reason": reason,
                "status": "active",
                "created_by": created_by.strip() or "unknown",
                "updated_by": created_by.strip() or "unknown",
                "created_at": now,
                "updated_at": now,
            }
            self._next_id += 1
            self._items.append(item)
            self._save()
            result = dict(item)
        self._fire("create", result)
        return result

    def edit(
        self,
        locked_id: int,
        *,
        text: str | None = None,
        reason: str | None = None,
        updated_by: str = "",
    ) -> dict | None:
        with self._lock:
            for item in self._items:
                if item["id"] != locked_id:
                    continue
                if text is not None:
                    next_text = text.strip()[:MAX_LOCKED_TEXT_CHARS]
                    if not next_text:
                        return None
                    item["text"] = next_text
                if reason is not None:
                    item["reason"] = reason.strip()[:MAX_LOCKED_REASON_CHARS]
                item["updated_by"] = updated_by.strip() or item.get("updated_by") or "unknown"
                item["updated_at"] = time.time()
                self._save()
                result = dict(item)
                break
            else:
                return None
        self._fire("update", result)
        return result

    def archive(self, locked_id: int, updated_by: str = "") -> dict | None:
        with self._lock:
            for item in self._items:
                if item["id"] != locked_id:
                    continue
                item["status"] = "archived"
                item["archived_at"] = time.time()
                item["updated_by"] = updated_by.strip() or item.get("updated_by") or "unknown"
                item["updated_at"] = time.time()
                self._save()
                result = dict(item)
                break
            else:
                return None
        self._fire("update", result)
        return result

    def restore(self, locked_id: int, updated_by: str = "") -> dict | None:
        with self._lock:
            for item in self._items:
                if item["id"] != locked_id:
                    continue
                item["status"] = "active"
                item.pop("archived_at", None)
                item["updated_by"] = updated_by.strip() or item.get("updated_by") or "unknown"
                item["updated_at"] = time.time()
                self._save()
                result = dict(item)
                break
            else:
                return None
        self._fire("update", result)
        return result

    def delete(self, locked_id: int) -> dict | None:
        with self._lock:
            for index, item in enumerate(self._items):
                if item["id"] != locked_id:
                    continue
                removed = self._items.pop(index)
                self._save()
                result = dict(removed)
                break
            else:
                return None
        self._fire("delete", result)
        return result
