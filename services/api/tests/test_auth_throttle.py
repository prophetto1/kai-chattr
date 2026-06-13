"""Phase 0 auth plan v2 — Task 4: login attempt throttling.

10 failures inside the 15-minute window lock the identifier for 15 minutes
(429 + Retry-After), success resets the counter, and unknown emails throttle
identically (no account enumeration via throttle behavior). Uses its own
auth_login_attempts table; auth_oauth_attempts is untouched.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi import FastAPI  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

SIGNUP = {"email": "jon@example.com", "password": "hunter2hunter2", "display_name": "Jon"}


def _client():
    from app.routes.auth import router
    from app.stores.identity_db import SqlAlchemyIdentityStore

    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool, future=True
    )
    store = SqlAlchemyIdentityStore(engine)
    app = FastAPI()
    app.state.identity_store = store
    app.include_router(router)
    return store, TestClient(app)


def _fail_login(client, n: int, email: str = SIGNUP["email"]) -> None:
    for _ in range(n):
        response = client.post("/auth/login", json={"email": email, "password": "wrong-password"})
        assert response.status_code == 401


def test_lockout_after_threshold_even_with_correct_password():
    _store, client = _client()
    client.post("/auth/signup", json=SIGNUP)

    _fail_login(client, 10)

    locked = client.post(
        "/auth/login", json={"email": SIGNUP["email"], "password": SIGNUP["password"]}
    )
    assert locked.status_code == 429
    assert int(locked.headers.get("retry-after", "0")) > 0


def test_success_resets_failure_counter():
    _store, client = _client()
    client.post("/auth/signup", json=SIGNUP)

    _fail_login(client, 5)
    ok = client.post(
        "/auth/login", json={"email": SIGNUP["email"], "password": SIGNUP["password"]}
    )
    assert ok.status_code == 200

    # Counter was cleared: 9 more failures stay under the threshold.
    _fail_login(client, 9)
    ok_again = client.post(
        "/auth/login", json={"email": SIGNUP["email"], "password": SIGNUP["password"]}
    )
    assert ok_again.status_code == 200


def test_unknown_email_throttles_identically():
    _store, client = _client()
    _fail_login(client, 10, email="ghost@example.com")
    locked = client.post(
        "/auth/login", json={"email": "ghost@example.com", "password": "whatever1"}
    )
    assert locked.status_code == 429
