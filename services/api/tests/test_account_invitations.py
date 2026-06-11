"""Plan 1.5 T6: /api/user/account + workspace invitations.

Locks acceptance items 4 and 5: the account endpoint answers from the session
and ignores client-supplied user ids; invitations ride the tenancy seam
(non-member 404), with role rules inside the workspace (member invite -> 403).
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool


def _harness():
    from app.routes.auth import router as auth_router
    from app.routes.invitations import router as invitations_router
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
    app.include_router(auth_router)
    app.include_router(invitations_router)
    return store, TestClient(app)


def _signup(client, email, name):
    return client.post(
        "/auth/signup",
        json={"email": email, "password": "hunter2hunter2", "display_name": name},
    ).json()


@pytest.fixture()
def world():
    store, client = _harness()
    owner = _signup(client, "owner@example.com", "Owner")
    invitee = _signup(client, "invitee@example.com", "Invitee")
    return store, client, owner, invitee


def _bearer(signup_body):
    return {"Authorization": f"Bearer {signup_body['token']}"}


# --- /api/user/account ---------------------------------------------------------


def test_account_returns_session_user_and_ignores_client_supplied_ids(world):
    _, client, owner, invitee = world

    response = client.get(
        f"/api/user/account?user_id={invitee['user']['id']}", headers=_bearer(owner)
    )
    assert response.status_code == 200
    # The session, not the query param, decides whose account this is.
    assert response.json()["user"]["id"] == owner["user"]["id"]
    assert response.json()["user"]["email"] == "owner@example.com"


def test_account_requires_a_valid_session(world):
    _, client, owner, _ = world
    assert client.get("/api/user/account").status_code == 401

    client.post("/auth/logout", headers=_bearer(owner))
    assert client.get("/api/user/account", headers=_bearer(owner)).status_code == 401


# --- /w/{workspace_public_id}/invitations ---------------------------------------


def test_owner_invites_existing_user_who_then_has_membership(world):
    store, client, owner, invitee = world
    wpid = owner["workspace"]["public_id"]

    response = client.post(
        f"/w/{wpid}/invitations",
        json={"email": "Invitee@Example.com", "role": "member"},  # case-insensitive
        headers=_bearer(owner),
    )
    assert response.status_code == 201
    assert response.json()["membership"]["role"] == "member"

    # Server-side truth: the membership row exists.
    ws = store.get_workspace_by_public_id(wpid)
    membership = store.get_membership(workspace_id=ws["id"], user_id=invitee["user"]["id"])
    assert membership is not None and membership["role"] == "member"


def test_non_member_gets_404_member_gets_403(world):
    _, client, owner, invitee = world
    wpid = owner["workspace"]["public_id"]
    payload = {"email": "owner@example.com", "role": "member"}

    # Non-member: the tenancy seam fails closed before role logic runs.
    assert (
        client.post(f"/w/{wpid}/invitations", json=payload, headers=_bearer(invitee)).status_code
        == 404
    )

    # Make invitee a plain member; inviting is still owner/admin-only -> 403.
    client.post(
        f"/w/{wpid}/invitations",
        json={"email": "invitee@example.com", "role": "member"},
        headers=_bearer(owner),
    )
    assert (
        client.post(f"/w/{wpid}/invitations", json=payload, headers=_bearer(invitee)).status_code
        == 403
    )


def test_duplicate_unknown_email_and_owner_role_are_rejected(world):
    _, client, owner, _ = world
    wpid = owner["workspace"]["public_id"]
    headers = _bearer(owner)

    first = client.post(
        f"/w/{wpid}/invitations", json={"email": "invitee@example.com"}, headers=headers
    )
    assert first.status_code == 201
    duplicate = client.post(
        f"/w/{wpid}/invitations", json={"email": "invitee@example.com"}, headers=headers
    )
    assert duplicate.status_code == 409

    unknown = client.post(
        f"/w/{wpid}/invitations", json={"email": "ghost@example.com"}, headers=headers
    )
    assert unknown.status_code == 404

    grant_owner = client.post(
        f"/w/{wpid}/invitations",
        json={"email": "invitee@example.com", "role": "owner"},
        headers=headers,
    )
    assert grant_owner.status_code == 422  # ownership is never granted by invite


# --- contracts -------------------------------------------------------------------


def test_t6_routes_have_registered_contracts():
    from app.endpoint_contract import endpoint_policy_for_path

    account = endpoint_policy_for_path("GET", "/api/user/account")
    assert account.auth == "user-bearer" and account.surface == "identity"

    invitations = endpoint_policy_for_path(
        "POST", "/w/{workspace_public_id}/invitations"
    )
    assert invitations.auth == "user-bearer" and invitations.surface == "identity"
