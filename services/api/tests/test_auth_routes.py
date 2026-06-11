"""Plan 1.5 T4: signup / login / logout routes.

Locks acceptance items 1 and 3: signup creates user + personal workspace
(owner) and rejects duplicate emails (S1); login issues a revocable session;
logout revokes it; login errors are uniform (no account enumeration).
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool


def _client():
    from app.routes.auth import router
    from app.stores.identity_db import SqlAlchemyIdentityStore

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    store = SqlAlchemyIdentityStore(engine)
    app = FastAPI()
    app.state.identity_store = store
    app.include_router(router)
    return store, TestClient(app)


SIGNUP = {"email": "Jon@Example.com", "password": "hunter2hunter2", "display_name": "Jon"}


def test_signup_creates_user_personal_workspace_and_session():
    store, client = _client()
    response = client.post("/auth/signup", json=SIGNUP)

    assert response.status_code == 201
    body = response.json()
    assert body["token"].startswith("kcs_")
    assert body["user"]["email"] == "jon@example.com"  # normalized
    assert body["workspace"]["public_id"].startswith("wsp_")
    assert body["workspace"]["tier"] == "free"

    # Owner membership really exists (server-side, not just response shape).
    ws = store.get_workspace_by_public_id(body["workspace"]["public_id"])
    membership = store.get_membership(workspace_id=ws["id"], user_id=body["user"]["id"])
    assert membership is not None and membership["role"] == "owner"
    # The issued token is a live session.
    assert store.validate_session(body["token"])["user_id"] == body["user"]["id"]


def test_signup_duplicate_email_is_409_even_with_different_case():
    _, client = _client()
    assert client.post("/auth/signup", json=SIGNUP).status_code == 201
    duplicate = dict(SIGNUP, email="JON@example.COM", display_name="Other")
    assert client.post("/auth/signup", json=duplicate).status_code == 409


def test_signup_rejects_short_password_and_garbage_email():
    _, client = _client()
    assert client.post("/auth/signup", json=dict(SIGNUP, password="short")).status_code == 422
    assert client.post("/auth/signup", json=dict(SIGNUP, email="not-an-email")).status_code == 422


def test_login_roundtrip_and_uniform_errors():
    store, client = _client()
    client.post("/auth/signup", json=SIGNUP)

    ok = client.post(
        "/auth/login", json={"email": "jon@example.com", "password": SIGNUP["password"]}
    )
    assert ok.status_code == 200
    assert store.validate_session(ok.json()["token"]) is not None

    wrong_password = client.post(
        "/auth/login", json={"email": "jon@example.com", "password": "wrong-password"}
    )
    unknown_email = client.post(
        "/auth/login", json={"email": "ghost@example.com", "password": "whatever1"}
    )
    assert wrong_password.status_code == unknown_email.status_code == 401
    # Uniform body: the response must not reveal whether the account exists.
    assert wrong_password.json() == unknown_email.json()


def test_logout_revokes_the_session():
    store, client = _client()
    token = client.post("/auth/signup", json=SIGNUP).json()["token"]

    response = client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200 and response.json()["revoked"] is True
    assert store.validate_session(token) is None
    # And without a token, logout is 401 (current_session guards it).
    assert client.post("/auth/logout").status_code == 401


def test_auth_routes_have_registered_contracts():
    from app.endpoint_contract import endpoint_policy_for_path

    assert endpoint_policy_for_path("POST", "/auth/signup").auth == "public"
    assert endpoint_policy_for_path("POST", "/auth/login").auth == "public"
    logout_policy = endpoint_policy_for_path("POST", "/auth/logout")
    assert logout_policy.auth == "user-bearer"
    assert logout_policy.surface == "identity"
