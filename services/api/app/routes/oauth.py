"""OAuth sign-in routes (Plan 1.5 T5) — Google + GitHub, S1 link rule.

The S1 lock, encoded in the callback:
- a returning provider credential logs in (keyed on the provider's immutable
  account id, never on mutable email);
- an IdP-VERIFIED email that matches an existing user LINKS the new provider
  credential to that user — never a second account;
- an UNVERIFIED email that matches an existing user requires login-then-link
  (409) — prevents unverified-email account takeover;
- a verified unknown email signs up (user + personal workspace + session);
- an unverified unknown email is rejected (403).

State is a server-side single-use hashed attempt row (borrowed shape from
writing-system); replay or expiry fails closed with 400.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse

from app.auth.oauth_providers import new_code_verifier

router = APIRouter()


def register_routes(main_module) -> None:  # handlers are local to this module
    return None


def _store(request: Request):
    store = getattr(request.app.state, "identity_store", None)
    if store is None:
        raise HTTPException(status_code=503, detail="identity store is not configured")
    return store


def _provider(request: Request, name: str):
    providers = getattr(request.app.state, "oauth_providers", None) or {}
    if name not in ("google", "github"):
        raise HTTPException(status_code=404, detail="unknown oauth provider")
    provider = providers.get(name)
    if provider is None:
        raise HTTPException(status_code=503, detail=f"oauth provider {name} is not configured")
    return provider


def _redirect_uri(request: Request, provider_name: str) -> str:
    base = str(request.base_url).rstrip("/")
    return f"{base}/auth/oauth/{provider_name}/callback"


@router.get("/auth/oauth/{provider_name}")
def oauth_start(provider_name: str, request: Request) -> RedirectResponse:
    provider = _provider(request, provider_name)
    code_verifier = new_code_verifier() if getattr(provider, "uses_pkce", False) else None
    attempt = _store(request).create_oauth_attempt(
        provider=provider_name, code_verifier=code_verifier
    )
    url = provider.authorize_url(
        state=attempt["state"],
        redirect_uri=_redirect_uri(request, provider_name),
        code_verifier=code_verifier or "",
    )
    return RedirectResponse(url, status_code=302)


@router.get("/auth/oauth/{provider_name}/callback")
def oauth_callback(
    provider_name: str, code: str, state: str, request: Request
) -> dict[str, Any]:
    provider = _provider(request, provider_name)
    store = _store(request)

    attempt = store.consume_oauth_attempt(state)
    if attempt is None or attempt["provider"] != provider_name:
        raise HTTPException(status_code=400, detail="invalid or expired oauth state")

    try:
        identity = provider.exchange(
            code=code,
            redirect_uri=_redirect_uri(request, provider_name),
            code_verifier=attempt.get("code_verifier"),
        )
    except Exception:
        raise HTTPException(status_code=502, detail="provider exchange failed")
    if not identity.provider_account_id or not identity.email:
        raise HTTPException(status_code=502, detail="provider returned an incomplete identity")

    # 1. Returning provider credential -> login.
    credential = store.find_credential_by_provider_account(
        provider=provider_name, provider_account_id=identity.provider_account_id
    )
    if credential is not None:
        user = store.get_user(credential["user_id"])
        if user is None or user.get("status") != "active":
            raise HTTPException(status_code=401, detail="account is not active")
        return _session_response(store, user, created=False)

    existing_user = store.find_user_by_email(identity.email)

    # 2. Known email: link only on an IdP-verified assertion (S1).
    if existing_user is not None:
        if not identity.email_verified:
            raise HTTPException(
                status_code=409,
                detail=(
                    "this email already has an account and the provider did not "
                    "verify it - log in with your password, then link the provider"
                ),
            )
        store.add_oauth_credential(
            user_id=existing_user["id"],
            provider=provider_name,
            provider_account_id=identity.provider_account_id,
            email_normalized=identity.email,
        )
        return _session_response(store, existing_user, created=False)

    # 3. Unknown email: sign up only with a provider-verified email.
    if not identity.email_verified:
        raise HTTPException(
            status_code=403, detail="the provider did not verify this email address"
        )
    user = store.create_user(email=identity.email, display_name="")
    store.add_oauth_credential(
        user_id=user["id"],
        provider=provider_name,
        provider_account_id=identity.provider_account_id,
        email_normalized=identity.email,
    )
    owner_label = user["email_normalized"].split("@")[0]
    workspace = store.create_workspace(
        name=f"{owner_label}'s workspace", created_by_user_id=user["id"]
    )
    store.add_membership(workspace_id=workspace["id"], user_id=user["id"], role="owner")
    response = _session_response(store, user, created=True)
    response["workspace"] = {
        "public_id": workspace["public_id"],
        "name": workspace["name"],
        "tier": workspace["tier"],
    }
    return response


def _session_response(store, user: dict[str, Any], *, created: bool) -> dict[str, Any]:
    issued = store.issue_session(user_id=user["id"])
    return {
        "token": issued["token"],
        "expires_at": issued["expires_at"],
        "created": created,
        "user": {
            "id": user["id"],
            "email": user["email_normalized"],
            "display_name": user["display_name"],
        },
    }
