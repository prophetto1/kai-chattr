"""Job store — bounded work conversations with threaded messages."""

import json
import time
import threading
import uuid
from pathlib import Path


CANONICAL_STATUSES = ("todo", "active", "closed")
LEGACY_STATUS_ALIASES = {
    "open": "todo",
    "done": "active",
    "archived": "closed",
}
VALID_WORKFLOW_STATUSES = CANONICAL_STATUSES + tuple(LEGACY_STATUS_ALIASES)


def normalize_status(status: str | None) -> str | None:
    value = (status or "").strip().lower()
    if value in CANONICAL_STATUSES:
        return value
    return LEGACY_STATUS_ALIASES.get(value)


def _coerce_archived(value) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on", "archived"}
    return bool(value)


def normalize_status_archived(
    status: str | None,
    archived=None,
    current_archived: bool = False,
    default_status: str = "todo",
) -> tuple[str, bool]:
    raw_status = (status or "").strip().lower()
    normalized = normalize_status(raw_status) or default_status
    if archived is None:
        next_archived = True if raw_status == "archived" else bool(current_archived)
    else:
        next_archived = _coerce_archived(archived)
    return normalized, next_archived


class JobVersionConflict(Exception):
    def __init__(self, job_id: int, expected: int, actual: int):
        super().__init__(f"job #{job_id} version conflict: expected {expected}, current {actual}")
        self.job_id = job_id
        self.expected = expected
        self.actual = actual


def _coerce_version(value, default: int = 1) -> int:
    try:
        version = int(value)
    except (TypeError, ValueError):
        return default
    return version if version > 0 else default


def _job_version(job: dict) -> int:
    return _coerce_version(job.get("version"), default=1)


def _check_expected_version(job: dict, expected_version: int | None) -> None:
    if expected_version is None:
        return
    expected = _coerce_version(expected_version, default=1)
    actual = _job_version(job)
    if expected != actual:
        raise JobVersionConflict(int(job.get("id", 0)), expected, actual)


def _bump_version(job: dict) -> None:
    job["version"] = _job_version(job) + 1


class JobStore:
    def __init__(self, path: str):
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._jobs: list[dict] = []
        self._next_id = 1
        self._lock = threading.Lock()
        self._callbacks: list = []  # (action, job) on any change
        self._load()

    def _load(self):
        if not self._path.exists():
            return
        try:
            raw = json.loads(self._path.read_text("utf-8"))
            if isinstance(raw, list):
                self._jobs = raw
                if self._jobs:
                    self._next_id = max(a["id"] for a in self._jobs) + 1
                    if self._ensure_sort_orders_locked():
                        self._save()
        except (json.JSONDecodeError, KeyError):
            self._jobs = []

    def _save(self):
        self._path.write_text(
            json.dumps(self._jobs, indent=2, ensure_ascii=False) + "\n",
            "utf-8",
        )

    def _next_sort_order_locked(self, status: str) -> int:
        normalized = normalize_status(status) or "todo"
        max_order = 0
        for a in self._jobs:
            if normalize_status(a.get("status")) != normalized:
                continue
            try:
                max_order = max(max_order, int(a.get("sort_order", 0)))
            except (TypeError, ValueError):
                continue
        return max_order + 1

    def _ensure_sort_orders_locked(self):
        max_by_group: dict[str, int] = {}
        changed = False
        for a in self._jobs:
            key = normalize_status(a.get("status")) or "todo"
            try:
                cur = int(a.get("sort_order", 0))
            except (TypeError, ValueError):
                cur = 0
            if cur > 0:
                max_by_group[key] = max(max_by_group.get(key, 0), cur)

        for a in self._jobs:
            key = normalize_status(a.get("status")) or "todo"
            try:
                cur = int(a.get("sort_order", 0))
            except (TypeError, ValueError):
                cur = 0
            if cur <= 0:
                next_order = max_by_group.get(key, 0) + 1
                a["sort_order"] = next_order
                max_by_group[key] = next_order
                changed = True
        return changed

    def on_change(self, callback):
        """Register a callback(action, job) on any change.
        action: 'create', 'update', 'message', 'message_delete'."""
        self._callbacks.append(callback)

    def _fire(self, action: str, job: dict):
        for cb in self._callbacks:
            try:
                cb(action, job)
            except Exception:
                pass

    def _job_dict(self, job: dict) -> dict:
        out = dict(job)
        status, archived = normalize_status_archived(
            out.get("status"),
            out.get("archived"),
        )
        out["status"] = status
        out["archived"] = archived
        out["version"] = _job_version(out)
        return out

    def list_all(self, channel: str | None = None,
                 status: str | None = None) -> list[dict]:
        """List jobs, optionally filtered by channel and/or status."""
        with self._lock:
            changed = self._ensure_sort_orders_locked()
            if changed:
                self._save()
            result = list(self._jobs)
        if channel:
            result = [a for a in result if a.get("channel") == channel]
        if status:
            raw_status = status.strip().lower()
            normalized = normalize_status(raw_status)
            if normalized is None:
                return []
            result = [a for a in result if normalize_status(a.get("status")) == normalized]
            if raw_status == "archived":
                result = [a for a in result if self._job_dict(a).get("archived")]
        return [self._job_dict(a) for a in result]

    def get(self, job_id: int) -> dict | None:
        with self._lock:
            for a in self._jobs:
                if a["id"] == job_id:
                    return self._job_dict(a)
            return None

    def create(self, title: str, job_type: str, channel: str,
               created_by: str, anchor_msg_id: int | None = None,
               assignee: str | None = None,
               body: str | None = None,
               uid: str | None = None,
               status: str | None = None,
               created_at: float | None = None,
               updated_at: float | None = None,
               archived: bool | None = None,
               version: int | None = None) -> dict:
        """Create a new job. Returns the job dict."""
        with self._lock:
            st, is_archived = normalize_status_archived(status, archived)
            now = time.time()
            a = {
                "id": self._next_id,
                "uid": uid or str(uuid.uuid4()),
                "type": job_type,
                "title": title.strip()[:120],
                "body": (body or "").strip()[:1000],
                "status": st,
                "archived": is_archived,
                "channel": channel,
                "created_by": created_by,
                "assignee": assignee or "",
                "anchor_msg_id": anchor_msg_id,
                "messages": [],
                "created_at": created_at or now,
                "updated_at": updated_at or now,
                "sort_order": self._next_sort_order_locked(st),
                "version": _coerce_version(version, default=1),
            }
            self._next_id += 1
            self._jobs.append(a)
            self._save()
        result = self._job_dict(a)
        self._fire("create", result)
        return result

    def update_status(
        self,
        job_id: int,
        status: str,
        archived: bool | None = None,
        expected_version: int | None = None,
    ) -> dict | None:
        """Update job status. Valid canonical statuses: todo, active, closed."""
        normalized = normalize_status(status)
        if normalized is None:
            return None
        with self._lock:
            for a in self._jobs:
                if a["id"] == job_id:
                    _check_expected_version(a, expected_version)
                    old_status = normalize_status(a.get("status"))
                    next_status, next_archived = normalize_status_archived(
                        status,
                        archived,
                        current_archived=self._job_dict(a).get("archived", False),
                    )
                    next_order = None
                    if old_status != next_status:
                        # Compute destination order before moving this job so
                        # the job doesn't count itself in the target lane.
                        next_order = self._next_sort_order_locked(next_status)
                    a["status"] = next_status
                    a["archived"] = next_archived
                    a["updated_at"] = time.time()
                    if next_order is not None:
                        a["sort_order"] = next_order
                    _bump_version(a)
                    self._save()
                    result = self._job_dict(a)
                    break
            else:
                return None
        self._fire("update", result)
        return result

    def update_archived(
        self,
        job_id: int,
        archived: bool,
        expected_version: int | None = None,
    ) -> dict | None:
        with self._lock:
            for a in self._jobs:
                if a["id"] == job_id:
                    _check_expected_version(a, expected_version)
                    a["archived"] = _coerce_archived(archived)
                    a["updated_at"] = time.time()
                    _bump_version(a)
                    self._save()
                    result = self._job_dict(a)
                    break
            else:
                return None
        self._fire("update", result)
        return result

    def update_title(
        self,
        job_id: int,
        title: str,
        expected_version: int | None = None,
    ) -> dict | None:
        with self._lock:
            for a in self._jobs:
                if a["id"] == job_id:
                    _check_expected_version(a, expected_version)
                    a["title"] = title.strip()[:120]
                    a["updated_at"] = time.time()
                    _bump_version(a)
                    self._save()
                    result = self._job_dict(a)
                    break
            else:
                return None
        self._fire("update", result)
        return result

    def update_assignee(
        self,
        job_id: int,
        assignee: str,
        expected_version: int | None = None,
    ) -> dict | None:
        with self._lock:
            for a in self._jobs:
                if a["id"] == job_id:
                    _check_expected_version(a, expected_version)
                    a["assignee"] = assignee.strip()
                    a["updated_at"] = time.time()
                    _bump_version(a)
                    self._save()
                    result = self._job_dict(a)
                    break
            else:
                return None
        self._fire("update", result)
        return result

    def add_message(self, job_id: int, sender: str, text: str,
                    attachments: list | None = None,
                    msg_type: str = "chat",
                    uid: str | None = None,
                    timestamp: float | None = None,
                    time_str: str | None = None) -> dict | None:
        """Add a message to a job's conversation. Returns the message."""
        with self._lock:
            for a in self._jobs:
                if a["id"] == job_id:
                    msg_id = len(a["messages"])
                    ts = timestamp if timestamp is not None else time.time()
                    msg = {
                        "id": msg_id,
                        "uid": uid or str(uuid.uuid4()),
                        "sender": sender,
                        "text": text.strip(),
                        "time": time_str or time.strftime("%H:%M:%S"),
                        "timestamp": ts,
                        "attachments": attachments or [],
                    }
                    if msg_type != "chat":
                        msg["type"] = msg_type
                    a["messages"].append(msg)
                    a["updated_at"] = time.time()
                    _bump_version(a)
                    self._save()
                    result_msg = dict(msg)
                    result_msg["job_id"] = job_id
                    break
            else:
                return None
        self._fire("message", {"job_id": job_id, "message": result_msg})
        return result_msg

    def get_messages(self, job_id: int) -> list[dict] | None:
        """Get all messages for a job."""
        with self._lock:
            for a in self._jobs:
                if a["id"] == job_id:
                    return list(a["messages"])
            return None

    def delete_message(self, job_id: int, msg_id: int) -> dict | None:
        """Soft-delete a message from a job conversation by message id."""
        with self._lock:
            for a in self._jobs:
                if a["id"] != job_id:
                    continue
                msgs = a.get("messages", [])
                hit = None
                for i, m in enumerate(msgs):
                    try:
                        mid = int(m.get("id", -1))
                    except (TypeError, ValueError):
                        mid = -1
                    if mid == msg_id:
                        hit = (i, m)
                        break
                if hit is None:
                    return None
                _, msg = hit
                if msg.get("deleted"):
                    return {"job_id": job_id, "message_id": msg_id}
                msg["deleted"] = True
                msg["text"] = ""
                msg["attachments"] = []
                msg["updated_at"] = time.time()
                a["updated_at"] = time.time()
                _bump_version(a)
                self._save()
                payload = {"job_id": job_id, "message_id": msg_id}
                break
            else:
                return None
        self._fire("message_delete", payload)
        return payload

    def resolve_message(self, job_id: int, msg_index: int, resolution: str) -> dict | None:
        """Mark a job-thread message as resolved."""
        with self._lock:
            for a in self._jobs:
                if a["id"] != job_id:
                    continue
                msgs = a.get("messages", [])
                if msg_index < 0 or msg_index >= len(msgs):
                    return None
                msg = msgs[msg_index]
                msg["resolved"] = resolution.strip()[:32] or "dismissed"
                msg["updated_at"] = time.time()
                a["updated_at"] = time.time()
                _bump_version(a)
                self._save()
                result_msg = dict(msg)
                result_msg["job_id"] = job_id
                break
            else:
                return None
        self._fire("message", {"job_id": job_id, "message": result_msg})
        return result_msg

    def delete(self, job_id: int, expected_version: int | None = None) -> dict | None:
        """Permanently delete a job."""
        with self._lock:
            for i, a in enumerate(self._jobs):
                if a["id"] == job_id:
                    _check_expected_version(a, expected_version)
                    removed = self._jobs.pop(i)
                    self._save()
                    result = self._job_dict(removed)
                    break
            else:
                return None
        self._fire("delete", result)
        return result

    def reorder(self, status: str, ordered_ids: list[int]) -> list[dict]:
        """Reorder jobs within a status group by explicit id order (top to bottom)."""
        normalized = normalize_status(status)
        if normalized is None:
            return []
        with self._lock:
            self._ensure_sort_orders_locked()
            group = [
                a for a in self._jobs
                if normalize_status(a.get("status")) == normalized
            ]
            if not group:
                return []

            by_id = {int(a["id"]): a for a in group}
            ordered: list[int] = []
            seen = set()
            for raw in ordered_ids:
                try:
                    aid = int(raw)
                except (TypeError, ValueError):
                    continue
                if aid in by_id and aid not in seen:
                    ordered.append(aid)
                    seen.add(aid)

            if not ordered:
                return []

            existing_sorted = sorted(
                group,
                key=lambda x: (int(x.get("sort_order", 0) or 0), float(x.get("updated_at", 0) or 0)),
                reverse=True,
            )
            for a in existing_sorted:
                aid = int(a["id"])
                if aid not in seen:
                    ordered.append(aid)

            changed: list[dict] = []
            n = len(ordered)
            for idx, aid in enumerate(ordered):
                item = by_id.get(aid)
                if not item:
                    continue
                new_order = n - idx
                old_order = int(item.get("sort_order", 0) or 0)
                if old_order != new_order:
                    item["sort_order"] = new_order
                    item["updated_at"] = time.time()
                    _bump_version(item)
                    changed.append(self._job_dict(item))

            if changed:
                self._save()

        for item in changed:
            self._fire("update", item)
        return changed
