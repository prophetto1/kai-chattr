"""Correctness + perf tests for MessageStore optimizations.

Drives the redesign of:
- O(1) get_by_id via id index
- bisect-based get_since on monotonic ids
- atomic todo persistence (no indent, atomic write)
- update_message / delete preserving the index

Behavioral parity must hold against the legacy implementation.
"""

import json
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.stores.messages import MessageStore  # noqa: E402


@pytest.fixture
def store(tmp_path):
    return MessageStore(str(tmp_path / "messages.jsonl"))


def _seed(store, n=200, channels=("general", "ops", "bugs")):
    for i in range(n):
        store.add(
            sender=f"u{i % 3}",
            text=f"msg {i}",
            channel=channels[i % len(channels)],
        )


class ExplodingMessages(list):
    def __iter__(self):
        raise AssertionError("todo path should use the id index, not scan _messages")


# -- Correctness: behavior must be identical to pre-optimization ---------


def test_get_by_id_returns_correct_message(store):
    _seed(store, 50)
    m = store.get_by_id(7)
    assert m is not None
    assert m["id"] == 7
    assert m["text"] == "msg 7"


def test_get_by_id_missing_returns_none(store):
    _seed(store, 10)
    assert store.get_by_id(9999) is None
    assert store.get_by_id(-1) is None


def test_get_by_id_after_delete_returns_none(store):
    _seed(store, 10)
    store.delete([3, 5])
    assert store.get_by_id(3) is None
    assert store.get_by_id(5) is None
    # Adjacent ids still work
    assert store.get_by_id(4)["id"] == 4
    assert store.get_by_id(6)["id"] == 6


def test_update_message_preserves_lookup(store):
    _seed(store, 10)
    store.update_message(5, {"text": "edited"})
    assert store.get_by_id(5)["text"] == "edited"


def test_get_since_returns_strictly_greater_ids(store):
    _seed(store, 30)
    out = store.get_since(15)
    assert all(m["id"] > 15 for m in out)
    assert [m["id"] for m in out] == list(range(16, 30))


def test_get_since_with_channel_filter(store):
    _seed(store, 30, channels=("general", "ops"))
    # since_id=-1 includes id=0; channels alternate general/ops by parity
    out = store.get_since(-1, channel="general")
    assert all(m["channel"] == "general" for m in out)
    assert {m["id"] for m in out} == {i for i in range(30) if i % 2 == 0}


def test_get_recent_count_and_channel(store):
    _seed(store, 30, channels=("general", "ops"))
    recent = store.get_recent(5, channel="ops")
    assert len(recent) == 5
    assert all(m["channel"] == "ops" for m in recent)
    # Should be the *latest* 5, not arbitrary
    assert recent[-1]["id"] >= recent[0]["id"]


def test_get_recent_by_channels_returns_limited_interleaved_history(store):
    for i, channel in enumerate(("a", "b", "c", "a", "b", "c", "a", "b", "c")):
        store.add("u", f"msg {i}", channel=channel, timestamp=float(i))

    recent = store.get_recent_by_channels(2, ["a", "b"])

    assert [m["id"] for m in recent] == [3, 4, 6, 7]
    assert [m["channel"] for m in recent] == ["a", "b", "a", "b"]


def test_persistence_roundtrip_preserves_index(tmp_path):
    p = str(tmp_path / "messages.jsonl")
    s1 = MessageStore(p)
    _seed(s1, 20)
    s1.update_message(7, {"text": "edit-7"})
    s1.delete([3])

    s2 = MessageStore(p)  # reload
    assert s2.get_by_id(7)["text"] == "edit-7"
    assert s2.get_by_id(3) is None
    # next id is preserved
    new = s2.add("user", "after reload")
    assert new["id"] == 20


def test_todo_lifecycle_persists_atomically(tmp_path):
    p = str(tmp_path / "messages.jsonl")
    s = MessageStore(p)
    _seed(s, 5)
    s.add_todo(2)
    s.complete_todo(2)
    # Ensure file is valid JSON
    todos_path = Path(p).parent / "todos.json"
    parsed = json.loads(todos_path.read_text("utf-8"))
    assert parsed == {"2": "done"}


def test_add_todo_uses_id_index_not_message_scan(store):
    _seed(store, 5)
    store._messages = ExplodingMessages(store._messages)

    assert store.add_todo(2) is True
    assert store.get_todo_status(2) == "todo"


def test_get_todo_messages_uses_id_index_not_message_scan(store):
    _seed(store, 5)
    store.add_todo(1)
    store.add_todo(4)
    store._messages = ExplodingMessages(store._messages)

    todos = store.get_todo_messages()

    assert [m["id"] for m in todos] == [1, 4]


def test_clear_channel_keeps_other_channels(store):
    _seed(store, 12, channels=("a", "b", "c"))
    store.clear(channel="b")
    remaining = store.get_recent(100)
    assert all(m["channel"] != "b" for m in remaining)
    # Index is consistent after clear
    survivor = remaining[0]["id"]
    assert store.get_by_id(survivor) is not None


def test_rename_channel_updates_index_consistently(store):
    _seed(store, 6, channels=("old", "x"))
    store.rename_channel("old", "new")
    after = store.get_recent(100, channel="new")
    assert len(after) == 3
    # Index lookup still works for renamed messages
    for m in after:
        assert store.get_by_id(m["id"]) is not None


def test_update_via_atomic_helper(store):
    """New helper: update_message_with_check — atomic check-and-set used for decisions."""
    _seed(store, 5)
    store.update_message(1, {"type": "decision",
                             "metadata": {"choices": ["yes", "no"], "resolved": False}})

    def mutator(msg):
        meta = dict(msg.get("metadata") or {})
        if meta.get("resolved"):
            return None  # signal already resolved
        meta["resolved"] = True
        meta["chosen"] = "yes"
        return {"metadata": meta}

    updated = store.update_message_atomic(1, mutator, expected_type="decision")
    assert updated is not None
    assert updated["metadata"]["resolved"] is True

    # Second call returns None (mutator signaled no-op)
    again = store.update_message_atomic(1, mutator, expected_type="decision")
    assert again is None

    # Wrong type guard
    bad = store.update_message_atomic(2, mutator, expected_type="decision")
    assert bad is None  # msg 2 is type "chat"


# -- Perf characteristic: O(1) lookup --------------------------------------


def test_get_by_id_is_sublinear_in_size(tmp_path):
    """get_by_id at the front should not be slower as the store grows.

    With a list scan that starts from the beginning, this would be O(1) anyway,
    so we test the *worst case* — get_by_id of the LAST item should be fast
    even with 5000 messages. If we used a list scan from the front, the small
    case takes ~5k iterations. With an index, it's a single dict lookup.
    """
    s = MessageStore(str(tmp_path / "perf.jsonl"))
    n = 5000
    for i in range(n):
        s.add("u", f"m{i}", channel="general")

    target = n - 1
    t0 = time.perf_counter()
    for _ in range(2000):
        s.get_by_id(target)
    elapsed = time.perf_counter() - t0

    # 2000 dict lookups should be well under 100ms even on slow CI.
    # A list scan over 5k items × 2000 calls would be ~10M comparisons (~1s+).
    assert elapsed < 0.5, f"get_by_id appears O(n): 2000 lookups took {elapsed:.3f}s"


def test_get_since_uses_monotonic_id_fast_path(tmp_path):
    """get_since with a recent cursor should NOT walk the whole list."""
    s = MessageStore(str(tmp_path / "perf.jsonl"))
    n = 5000
    for i in range(n):
        s.add("u", f"m{i}", channel="general")

    cursor = n - 5
    t0 = time.perf_counter()
    for _ in range(2000):
        out = s.get_since(cursor)
    elapsed = time.perf_counter() - t0
    assert len(out) == 4
    # bisect-based path: ~O(log n) per call. 2000 calls should be under 200ms.
    assert elapsed < 0.5, f"get_since appears O(n): 2000 calls took {elapsed:.3f}s"
