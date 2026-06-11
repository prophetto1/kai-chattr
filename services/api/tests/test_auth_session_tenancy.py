"""Plan 1.5 batch 1: argon2 passwords, revocable DB sessions, the tenancy seam.

Locks acceptance items 3 and 4 of the Plan 1.5 contract:
- login-issued sessions are revocable; revoked/expired tokens fail `current_session`;
- `resolve_workspace_context` yields the member's context, a non-member gets 404
  (never 403 — no tenant enumeration), and `workspace_scoped` pins queries to the
  authorized workspace.
"""

from __future__ import annotations

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.pool import StaticPool


def _memory_store():
    from app.stores.identity_db import SqlAlchemyIdentityStore

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    return SqlAlchemyIdentityStore(engine)


# --- T1: passwords -----------------------------------------------------------


def test_password_hash_roundtrip():
    from app.auth.passwords import hash_password, verify_password

    digest = hash_password("correct horse battery staple")
    assert digest.startswith("$argon2id$")
    assert verify_password(digest, "correct horse battery staple")
    assert not verify_password(digest, "wrong password")


# --- T1: sessions ------------------------------------------------------------


def test_issue_session_returns_raw_token_but_stores_hash_only():
    from app.auth.tokens import hash_token
    from app.stores.identity_db import AuthSession

    store = _memory_store()
    user = store.create_user(email="s1@example.com", display_name="S1")
    issued = store.issue_session(user_id=user["id"])

    assert issued["token"].startswith("kcs_")
    with store._sessions() as raw:  # noqa: SLF001 (white-box: prove at-rest shape)
        record = raw.scalar(select(AuthSession))
        assert record.session_token_hash == hash_token(issued["token"])
        assert issued["token"] not in record.session_token_hash


def test_validate_session_roundtrip_and_revoke():
    store = _memory_store()
    user = store.create_user(email="s2@example.com", display_name="S2")
    issued = store.issue_session(user_id=user["id"])

    session = store.validate_session(issued["token"])
    assert session is not None and session["user_id"] == user["id"]

    assert store.revoke_session(issued["token"]) is True
    assert store.validate_session(issued["token"]) is None
    assert store.validate_session("kcs_never-issued") is None


def test_expired_session_fails_validation():
    store = _memory_store()
    user = store.create_user(email="s3@example.com", display_name="S3")
    issued = store.issue_session(user_id=user["id"], ttl_seconds=-1)
    assert store.validate_session(issued["token"]) is None


# --- T2 + T3: the FastAPI seam ------------------------------------------------


def _seam_app(store):
    from app.auth.tenancy import WorkspaceContext, resolve_workspace_context

    app = FastAPI()
    app.state.identity_store = store

    @app.get("/w/{workspace_public_id}/ping")
    def ping(ctx: WorkspaceContext = Depends(resolve_workspace_context)):
        return {
            "workspace_public_id": ctx.workspace_public_id,
            "workspace_id": ctx.workspace_id,
            "role": ctx.membership_role,
        }

    return app


@pytest.fixture()
def seam():
    store = _memory_store()
    owner = store.create_user(email="owner@example.com", display_name="Owner")
    outsider = store.create_user(email="outsider@example.com", display_name="Outsider")
    ws = store.create_workspace(name="Acme", created_by_user_id=owner["id"])
    store.add_membership(workspace_id=ws["id"], user_id=owner["id"], role="owner")
    client = TestClient(_seam_app(store))
    return store, owner, outsider, ws, client


def test_member_resolves_workspace_context(seam):
    store, owner, _, ws, client = seam
    token = store.issue_session(user_id=owner["id"])["token"]

    response = client.get(
        f"/w/{ws['public_id']}/ping", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["workspace_public_id"] == ws["public_id"]
    assert body["workspace_id"] == ws["id"]  # internal id resolved server-side
    assert body["role"] == "owner"


def test_non_member_gets_404_not_403(seam):
    store, _, outsider, ws, client = seam
    token = store.issue_session(user_id=outsider["id"])["token"]

    response = client.get(
        f"/w/{ws['public_id']}/ping", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 404  # fail closed; no tenant enumeration


def test_unknown_workspace_gets_404(seam):
    store, owner, _, _, client = seam
    token = store.issue_session(user_id=owner["id"])["token"]
    response = client.get(
        "/w/wsp_doesnotexist/ping", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 404


def test_missing_revoked_and_garbage_tokens_get_401(seam):
    store, owner, _, ws, client = seam
    url = f"/w/{ws['public_id']}/ping"

    assert client.get(url).status_code == 401  # no token
    assert client.get(url, headers={"Authorization": "Bearer junk"}).status_code == 401

    token = store.issue_session(user_id=owner["id"])["token"]
    store.revoke_session(token)
    assert client.get(url, headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_workspace_scoped_filters_to_authorized_workspace(seam):
    from app.auth.tenancy import WorkspaceContext, workspace_scoped
    from app.stores.identity_db import ChatSession

    store, owner, _, ws, _ = seam
    other_ws = store.create_workspace(name="Other", created_by_user_id=owner["id"])
    store.create_chat_session(
        workspace_id=ws["id"], created_by_user_id=owner["id"], title="mine", mode="scratch"
    )
    store.create_chat_session(
        workspace_id=other_ws["id"], created_by_user_id=owner["id"], title="other", mode="scratch"
    )

    ctx = WorkspaceContext(
        user_id=owner["id"],
        workspace_id=ws["id"],
        workspace_public_id=ws["public_id"],
        membership_role="owner",
    )
    with store._sessions() as raw:  # noqa: SLF001
        rows = raw.scalars(workspace_scoped(select(ChatSession), ChatSession, ctx)).all()
    assert [r.title for r in rows] == ["mine"]
