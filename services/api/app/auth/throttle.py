"""Login attempt throttling policy (Phase 0 auth plan v2, Task 4).

The identifier is the SHA-256 of the submitted, normalized email — computed
whether or not the account exists, so throttle behavior cannot be used for
account enumeration. State lives in auth_login_attempts (Postgres, like all
of the account plane); auth_oauth_attempts (OAuth/PKCE state) is untouched.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import Any


def login_identifier(email: str) -> str:
    normalized = (email or "").strip().lower()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def retry_after_seconds(store: Any, email: str) -> int | None:
    """Seconds the caller must wait, or None when login may proceed."""
    locked_until = store.login_locked_until(login_identifier(email))
    if locked_until is None:
        return None
    remaining = (locked_until - datetime.now(UTC)).total_seconds()
    return max(1, int(remaining)) if remaining > 0 else None


def note_login_failure(store: Any, email: str) -> None:
    store.register_login_failure(login_identifier(email))


def note_login_success(store: Any, email: str) -> None:
    store.clear_login_failures(login_identifier(email))
