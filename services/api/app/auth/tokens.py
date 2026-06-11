"""Opaque session tokens backed by ``auth_sessions``.

The raw token is shown to the client exactly once; only its SHA-256 is stored
(locked decision: revocable DB-backed sessions, token SHA-256 at rest). The
database row is the single source of truth — there is no second, stateless
validation path to drift from it.
"""

from __future__ import annotations

import hashlib
import secrets

SESSION_TOKEN_PREFIX = "kcs_"


def new_session_token() -> str:
    return SESSION_TOKEN_PREFIX + secrets.token_urlsafe(32)


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
