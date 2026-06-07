"""JSONL message persistence for the chat room with observer callbacks."""

import bisect
import json
import os
import time
import threading
import uuid
from pathlib import Path


class MessageStore:
    def __init__(self, path: str):
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._todos_path = self._path.parent / "todos.json"
        self._messages: list[dict] = []
        self._by_id: dict[int, dict] = {}   # O(1) lookup index — same dict refs as _messages
        self._next_id: int = 0  # monotonically increasing, survives deletions
        self._todos: dict[int, str] = {}  # msg_id → "todo" | "done"
        self._lock = threading.Lock()
        self._callbacks: list = []  # called on each new message
        self._todo_callbacks: list = []  # called on todo changes
        self._delete_callbacks: list = []  # called on message deletion
        self.upload_dir = self._path.parent.parent / "uploads"  # Default fallback
        self._load()
        self._load_todos()

    def _load(self):
        if not self._path.exists():
            return
        max_id = -1
        with open(self._path, "r", encoding="utf-8") as f:
            for i, line in enumerate(f):
                line = line.strip()
                if not line:
                    continue
                try:
                    msg = json.loads(line)
                    # Preserve persisted ID; fall back to line number for legacy data
                    if "id" not in msg:
                        msg["id"] = i
                    if msg["id"] > max_id:
                        max_id = msg["id"]
                    self._messages.append(msg)
                    self._by_id[msg["id"]] = msg
                except json.JSONDecodeError:
                    continue
        self._next_id = max_id + 1

    def on_message(self, callback):
        """Register a callback(msg) called whenever a message is added."""
        self._callbacks.append(callback)

    def add(self, sender: str, text: str, msg_type: str = "chat",
            attachments: list | None = None, reply_to: int | None = None,
            channel: str = "general",
            metadata: dict | None = None,
            uid: str | None = None,
            timestamp: float | None = None,
            time_str: str | None = None,
            _bulk: bool = False) -> dict:
        with self._lock:
            ts = timestamp if timestamp is not None else time.time()
            msg = {
                "id": self._next_id,
                "uid": uid or str(uuid.uuid4()),
                "sender": sender,
                "text": text,
                "type": msg_type,
                "timestamp": ts,
                "time": time_str or time.strftime("%H:%M:%S"),
                "attachments": attachments or [],
                "channel": channel,
            }
            if reply_to is not None:
                msg["reply_to"] = reply_to
            if metadata:
                msg["metadata"] = metadata
            self._next_id += 1
            self._messages.append(msg)
            self._by_id[msg["id"]] = msg
            if not _bulk:
                # flush to OS buffer; skip fsync per-message — it dominated send
                # latency (~300µs/msg) and is unnecessary for a chat log on a
                # developer machine. Durability is preserved on clean shutdown
                # and on the periodic _rewrite_jsonl path which still fsyncs.
                with open(self._path, "a", encoding="utf-8") as f:
                    f.write(json.dumps(msg, ensure_ascii=False) + "\n")
                    f.flush()

        # Fire callbacks outside the lock (skip during bulk import)
        if not _bulk:
            for cb in self._callbacks:
                try:
                    cb(msg)
                except Exception:
                    pass

        return msg

    def flush_bulk(self):
        """Write all in-memory messages to disk. Call after bulk add operations."""
        with self._lock:
            self._rewrite()

    def update_reply_to(self, msg_id: int, reply_to: int):
        """Set reply_to on an existing message (used by import to rebuild links)."""
        with self._lock:
            m = self._by_id.get(msg_id)
            if m is not None:
                m["reply_to"] = reply_to
                self._rewrite()

    def _rewrite(self):
        """Rewrite the full JSONL file from memory (used after bulk edits)."""
        with open(self._path, "w", encoding="utf-8") as f:
            for m in self._messages:
                f.write(json.dumps(m, ensure_ascii=False) + "\n")
            f.flush()
            os.fsync(f.fileno())

    def get_by_id(self, msg_id: int) -> dict | None:
        with self._lock:
            return self._by_id.get(msg_id)

    def get_recent(self, count: int = 50, channel: str | None = None) -> list[dict]:
        with self._lock:
            if channel:
                # Walk from the tail so we stop as soon as we have `count` matches
                # for the requested channel — avoids an O(N) scan of the whole log
                # when only the latest few entries in this channel are needed.
                out: list[dict] = []
                for m in reversed(self._messages):
                    if m.get("channel", "general") == channel:
                        out.append(m)
                        if len(out) >= count:
                            break
                out.reverse()
                return out
            return list(self._messages[-count:])

    def get_recent_by_channels(self, count: int, channels: list[str]) -> list[dict]:
        """Return up to `count` recent messages per channel in timestamp order."""
        with self._lock:
            channel_names = list(dict.fromkeys(channels))
            if count <= 0 or not channel_names:
                return []
            channel_set = set(channel_names)
            per_channel: dict[str, list[dict]] = {channel: [] for channel in channel_names}
            remaining = count * len(channel_names)

            for message in reversed(self._messages):
                channel = message.get("channel", "general")
                bucket = per_channel.get(channel)
                if channel not in channel_set or bucket is None or len(bucket) >= count:
                    continue
                bucket.append(message)
                remaining -= 1
                if remaining <= 0:
                    break

            out: list[dict] = []
            for bucket in per_channel.values():
                out.extend(bucket)
            out.sort(key=lambda m: m.get("timestamp", 0))
            return out

    def get_since(self, since_id: int = 0, channel: str | None = None) -> list[dict]:
        with self._lock:
            # IDs in self._messages are monotonically increasing (append-only;
            # delete preserves order). Bisect on the id key — O(log N) cutoff
            # instead of scanning every message.
            start = bisect.bisect_right(
                self._messages, since_id, key=lambda m: m["id"]
            )
            tail = self._messages[start:]
            if channel:
                tail = [m for m in tail if m.get("channel", "general") == channel]
            return tail

    def delete(self, msg_ids: list[int]) -> list[int]:
        """Delete messages by ID. Returns list of IDs actually deleted."""
        deleted = []
        deleted_attachments = []
        with self._lock:
            ids_to_delete = {mid for mid in msg_ids if mid in self._by_id}
            if ids_to_delete:
                for mid in ids_to_delete:
                    m = self._by_id.pop(mid)
                    for att in m.get("attachments", []):
                        url = att.get("url", "")
                        if url.startswith("/uploads/"):
                            deleted_attachments.append(url.split("/")[-1])
                    if mid in self._todos:
                        del self._todos[mid]
                    deleted.append(mid)
                # Single pass to rebuild the message list without the dropped ids
                self._messages = [m for m in self._messages if m["id"] not in ids_to_delete]
                self._rewrite_jsonl()
                self._save_todos()

        # Clean up uploaded images outside the lock
        for filename in deleted_attachments:
            filepath = self.upload_dir / filename
            if filepath.exists():
                try:
                    filepath.unlink()
                except Exception:
                    pass

        # Fire callbacks
        for cb in self._delete_callbacks:
            try:
                cb(deleted)
            except Exception:
                pass

        return deleted

    def on_delete(self, callback):
        """Register a callback(ids) called when messages are deleted."""
        self._delete_callbacks.append(callback)

    def update_message(self, msg_id: int, updates: dict) -> dict | None:
        """Update fields on a message in-place. Returns the updated message or None."""
        with self._lock:
            m = self._by_id.get(msg_id)
            if m is None:
                return None
            m.update(updates)
            self._rewrite_jsonl()
            return dict(m)

    def update_message_atomic(
        self,
        msg_id: int,
        mutator,
        expected_type: str | None = None,
    ) -> dict | None:
        """Atomic check-and-set on a single message.

        `mutator(msg)` is called with the live message dict (under the lock)
        and must return either a dict of fields to apply or None to abort
        (e.g. precondition already satisfied). Returns a copy of the updated
        message, or None if the message was missing, the type guard failed,
        or the mutator aborted.

        Replaces the previous pattern of reaching into `store._messages` and
        `store._rewrite()` directly from app routes — that bypassed the public
        API and duplicated the linear-scan we just eliminated.
        """
        with self._lock:
            m = self._by_id.get(msg_id)
            if m is None:
                return None
            if expected_type is not None and m.get("type") != expected_type:
                return None
            updates = mutator(m)
            if not updates:
                return None
            m.update(updates)
            self._rewrite_jsonl()
            return dict(m)

    def _rewrite_jsonl(self):
        """Rewrite the JSONL file from current in-memory messages."""
        with open(self._path, "w", encoding="utf-8") as f:
            for m in self._messages:
                f.write(json.dumps(m, ensure_ascii=False) + "\n")
            f.flush()
            os.fsync(f.fileno())

    def clear(self, channel: str | None = None):
        """Wipe messages and rewrite the log file.
        If channel is given, only clear messages in that channel."""
        with self._lock:
            if channel:
                removed_ids = {m["id"] for m in self._messages if m.get("channel", "general") == channel}
                self._messages = [m for m in self._messages if m.get("channel", "general") != channel]
                for mid in removed_ids:
                    self._by_id.pop(mid, None)
                self._rewrite_jsonl()
                # Clean up todos for cleared messages
                for tid in list(self._todos.keys()):
                    if tid in removed_ids:
                        del self._todos[tid]
                if removed_ids:
                    self._save_todos()
            else:
                self._messages.clear()
                self._by_id.clear()
                self._path.write_text("")
                self._todos.clear()
                self._save_todos()

    def rename_channel(self, old_name: str, new_name: str):
        """Migrate all messages from old_name to new_name."""
        with self._lock:
            modified = False
            for m in self._messages:
                if m.get("channel") == old_name:
                    m["channel"] = new_name
                    modified = True
            if modified:
                self._rewrite_jsonl()

    def rename_sender(self, old_name: str, new_name: str) -> int:
        """Rename sender on all messages from old_name to new_name. Returns count updated."""
        with self._lock:
            count = 0
            for m in self._messages:
                if m.get("sender") == old_name:
                    m["sender"] = new_name
                    count += 1
            if count:
                self._rewrite_jsonl()
        return count

    def delete_channel(self, name: str):
        """Remove all messages belonging to a deleted channel."""
        with self._lock:
            removed_ids = {m["id"] for m in self._messages if m.get("channel") == name}
            if removed_ids:
                self._messages = [m for m in self._messages if m["id"] not in removed_ids]
                for mid in removed_ids:
                    self._by_id.pop(mid, None)
                self._rewrite_jsonl()
                # Clean up todos that referenced deleted messages
                for tid in list(self._todos.keys()):
                    if tid in removed_ids:
                        del self._todos[tid]
                self._save_todos()

    # --- Todos ---

    def _load_todos(self):
        # Migrate old pins.json (list of ints) → todos.json (dict of id→status)
        old_pins = self._todos_path.parent / "pins.json"
        if old_pins.exists() and not self._todos_path.exists():
            try:
                ids = json.loads(old_pins.read_text("utf-8"))
                if isinstance(ids, list):
                    self._todos = {int(i): "todo" for i in ids}
                    self._save_todos()
                    old_pins.unlink()
            except Exception:
                pass

        if self._todos_path.exists():
            try:
                raw = json.loads(self._todos_path.read_text("utf-8"))
                self._todos = {int(k): v for k, v in raw.items()}
            except Exception:
                self._todos = {}

    def _save_todos(self):
        # Atomic write: tmp + replace prevents corruption if killed mid-write.
        # Drop indent — the file is read by the server, not edited by hand.
        tmp = self._todos_path.with_suffix(".tmp")
        tmp.write_text(
            json.dumps({str(k): v for k, v in self._todos.items()}),
            "utf-8",
        )
        os.replace(tmp, self._todos_path)

    def on_todo(self, callback):
        """Register a callback(msg_id, status) called on todo changes.
        status is 'todo', 'done', or None (removed)."""
        self._todo_callbacks.append(callback)

    def _fire_todo(self, msg_id: int, status: str | None):
        for cb in self._todo_callbacks:
            try:
                cb(msg_id, status)
            except Exception:
                pass

    def add_todo(self, msg_id: int) -> bool:
        with self._lock:
            if msg_id not in self._by_id:
                return False
            self._todos[msg_id] = "todo"
            self._save_todos()
        self._fire_todo(msg_id, "todo")
        return True

    def complete_todo(self, msg_id: int) -> bool:
        with self._lock:
            if msg_id not in self._todos:
                return False
            self._todos[msg_id] = "done"
            self._save_todos()
        self._fire_todo(msg_id, "done")
        return True

    def reopen_todo(self, msg_id: int) -> bool:
        with self._lock:
            if msg_id not in self._todos:
                return False
            self._todos[msg_id] = "todo"
            self._save_todos()
        self._fire_todo(msg_id, "todo")
        return True

    def remove_todo(self, msg_id: int) -> bool:
        with self._lock:
            if msg_id not in self._todos:
                return False
            del self._todos[msg_id]
            self._save_todos()
        self._fire_todo(msg_id, None)
        return True

    def get_todo_status(self, msg_id: int) -> str | None:
        return self._todos.get(msg_id)

    def get_todos(self) -> dict[int, str]:
        """Returns {msg_id: status} for all todos."""
        return dict(self._todos)

    def get_todo_messages(self, status: str | None = None) -> list[dict]:
        """Get todo messages, optionally filtered by status."""
        with self._lock:
            if status:
                ids = [k for k, v in self._todos.items() if v == status]
            else:
                ids = list(self._todos.keys())
            return [self._by_id[msg_id] for msg_id in sorted(ids) if msg_id in self._by_id]

    @property
    def last_id(self) -> int:
        with self._lock:
            return self._messages[-1]["id"] if self._messages else -1
