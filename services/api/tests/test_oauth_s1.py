"""Plan 1.5 T5: OAuth callback with the S1 link rule (acceptance 2).

A fake provider stands in for the external IdP boundary only — attempt rows,
state hashing/expiry/replay, the S1 decision tree, credentials, workspaces,
and sessions all run the real code paths.
"""

from __future__ import annotations

from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

from app.auth.oauth_providers import OAuthIdentity


class FakeProvider:
    name = "google"
    uses_pkce = True

    def __init__(self):
        self.identity: OAuthIdentity | None = None
        self.seen_code_verifier = "unset"

    def authorize_url(self, *, state: str, redirect_uri: str, code_verifier: str) -> str:
        return f"https://idp.example/authorize?state={state}&redirect_uri={redirect_uri}"

    def exchange(self, *, code: str, redirect_uri: str, code_verifier: str | None):
        self.seen_code_verifier = code_verifier
        if self.identity is None:
            raise RuntimeError("exchange failure")
        return self.identity


def _harness():
    from app.routes.auth import router as auth_router
    from app.routes.oauth import router as oauth_router
    from app.stores.identity_db import SqlAlchemyIdentityStore

    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    store = SqlAlchemyIdentityStore(engine)
    fake = FakeProvider()
    app = FastAPI()
    app.state.identity_store = store
    app.state.oauth_providers = {"google": fake}
    app.include_router(auth_router)
    app.include_router(oauth_router)
    return store, fake, TestClient(app)


def _start_and_get_state(client) -> str:
    response = client.get("/auth/oauth/google", follow_redirects=False)
    assert response.status_code == 302
    return parse_qs(urlparse(response.headers["location"]).query)["state"][0]


def _callback(client, state):
    return client.get(
        "/auth/oauth/google/callback", params={"code": "fake-code", "state": state}
    )


def _password_signup(client, email):
    return client.post(
        "/auth/signup",
        json={"email": email, "password": "hunter2hunter2", "display_name": "Jon"},
    ).json()


def test_unknown_provider_404_and_unconfigured_503():
    _, _, client = _harness()
    assert client.get("/auth/oauth/gitlab", follow_redirects=False).status_code == 404
    assert client.get("/auth/oauth/github", follow_redirects=False).status_code == 503


def test_verified_email_links_to_existing_user_never_a_second_account():
    store, fake, client = _harness()
    existing = _password_signup(client, "jon@example.com")
    fake.identity = OAuthIdentity("g-123", "Jon@Example.com", email_verified=True)

    response = _callback(client, _start_and_get_state(client))

    assert response.status_code == 200
    body = response.json()
    assert body["created"] is False
    assert body["user"]["id"] == existing["user"]["id"]  # linked, not duplicated
    linked = store.find_credential_by_provider_account(
        provider="google", provider_account_id="g-123"
    )
    assert linked is not None and linked["user_id"] == existing["user"]["id"]
    # PKCE verifier flowed from the attempt row into the exchange.
    assert fake.seen_code_verifier


def test_unverified_email_with_existing_account_requires_login_then_link():
    store, fake, client = _harness()
    _password_signup(client, "jon@example.com")
    fake.identity = OAuthIdentity("g-123", "jon@example.com", email_verified=False)

    response = _callback(client, _start_and_get_state(client))

    assert response.status_code == 409  # S1: no auto-link without IdP verification
    assert (
        store.find_credential_by_provider_account(
            provider="google", provider_account_id="g-123"
        )
        is None
    )


def test_verified_unknown_email_signs_up_with_personal_workspace():
    store, fake, client = _harness()
    fake.identity = OAuthIdentity("g-777", "new@example.com", email_verified=True)

    response = _callback(client, _start_and_get_state(client))

    assert response.status_code == 200
    body = response.json()
    assert body["created"] is True
    assert body["workspace"]["public_id"].startswith("wsp_")
    user = store.find_user_by_email("new@example.com")
    ws = store.get_workspace_by_public_id(body["workspace"]["public_id"])
    membership = store.get_membership(workspace_id=ws["id"], user_id=user["id"])
    assert membership is not None and membership["role"] == "owner"
    assert store.validate_session(body["token"]) is not None


def test_unverified_unknown_email_is_rejected():
    store, fake, client = _harness()
    fake.identity = OAuthIdentity("g-999", "shady@example.com", email_verified=False)

    assert _callback(client, _start_and_get_state(client)).status_code == 403
    assert store.find_user_by_email("shady@example.com") is None


def test_returning_provider_credential_logs_in_without_duplicates():
    store, fake, client = _harness()
    fake.identity = OAuthIdentity("g-777", "new@example.com", email_verified=True)
    first = _callback(client, _start_and_get_state(client)).json()

    second = _callback(client, _start_and_get_state(client))
    assert second.status_code == 200
    assert second.json()["created"] is False
    assert second.json()["user"]["id"] == first["user"]["id"]


def test_state_is_single_use_and_garbage_state_fails_closed():
    _, fake, client = _harness()
    fake.identity = OAuthIdentity("g-777", "new@example.com", email_verified=True)
    state = _start_and_get_state(client)

    assert _callback(client, state).status_code == 200
    assert _callback(client, state).status_code == 400  # replay
    assert _callback(client, "kos_garbage").status_code == 400


def test_oauth_routes_have_public_contracts():
    from app.endpoint_contract import endpoint_policy_for_path

    start = endpoint_policy_for_path("GET", "/auth/oauth/{provider_name}")
    callback = endpoint_policy_for_path("GET", "/auth/oauth/{provider_name}/callback")
    assert start.auth == callback.auth == "public"
    assert start.surface == callback.surface == "identity"
