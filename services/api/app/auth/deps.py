"""FastAPI auth dependencies (Plan 1.5).

The identity store is wired by the app at startup as
``app.state.identity_store``; tests inject their own instance the same way.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request


def _identity_store(request: Request):
    store = getattr(request.app.state, "identity_store", None)
    if store is None:
        # Fail loudly: a route depended on auth before the store was wired.
        raise HTTPException(status_code=500, detail="identity store is not configured")
    return store


def current_session(request: Request) -> dict[str, Any]:
    """Validate the bearer session token against ``auth_sessions``.

    Returns the session dict (incl. ``user_id``). 401 on missing, unknown,
    revoked, or expired tokens — the DB row is the single source of truth.
    """
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="missing bearer session token")
    session = _identity_store(request).validate_session(token.strip())
    if session is None:
        raise HTTPException(status_code=401, detail="invalid or expired session")
    return session
