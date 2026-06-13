"""Identity auth routes (Plan 1.5 T4): signup, login, logout.

Authn happens here at the route layer (argon2 + revocable bearer sessions on
``auth_sessions``), not in the legacy x-session-token middleware. Login errors
are uniform — the response never reveals whether the email exists.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError

from app.auth import throttle
from app.auth.deps import current_session
from app.auth.passwords import hash_password, verify_password

router = APIRouter()


def register_routes(main_module) -> None:  # handlers are local to this module
    return None


class SignupRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=8, max_length=200)
    display_name: str = Field(default="", max_length=200)

    @field_validator("email")
    @classmethod
    def _email_shape(cls, value: str) -> str:
        candidate = value.strip()
        local, _, domain = candidate.partition("@")
        if not local or not domain or " " in candidate:
            raise ValueError("not a valid email address")
        return candidate


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=200)


def _store(request: Request):
    store = getattr(request.app.state, "identity_store", None)
    if store is None:
        raise HTTPException(status_code=503, detail="identity store is not configured")
    return store


# --- Local-mode bootstrap (Phase 0 auth plan v2, Task 0) ---

LOCAL_OWNER_EMAIL = "owner@local.kai"
LOCAL_WORKSPACE_PUBLIC_ID = "local"


def _is_loopback(request: Request) -> bool:
    host = request.client.host if request.client else ""
    return host in ("127.0.0.1", "::1", "localhost", "testclient")


def _runtime_mode(request: Request) -> str:
    return str(getattr(request.app.state, "runtime_mode", "local") or "local")


def _session_payload(store, user: dict[str, Any], workspace: dict[str, Any]) -> dict[str, Any]:
    issued = store.issue_session(user_id=user["id"])
    return {
        "token": issued["token"],
        "expires_at": issued["expires_at"],
        "user": {
            "id": user["id"],
            "email": user["email_normalized"],
            "display_name": user["display_name"],
        },
        "workspace": {
            "public_id": workspace["public_id"],
            "name": workspace["name"],
            "tier": workspace["tier"],
        },
    }


@router.post("/auth/local-session")
def local_session(request: Request) -> dict[str, Any]:
    """Mint the local owner's session. Loopback + local runtime mode only.

    Idempotently ensures the owner user and the 'local' workspace exist;
    response shape matches signup/login (AuthSession). The launcher token is
    never a product credential — local mode bootstraps a real auth session.
    """
    if _runtime_mode(request) != "local":
        raise HTTPException(status_code=403, detail="local bootstrap is local-mode only")
    if not _is_loopback(request):
        raise HTTPException(status_code=403, detail="local bootstrap requires a loopback client")
    store = _store(request)

    user = store.find_user_by_email(LOCAL_OWNER_EMAIL)
    if user is None:
        user = store.create_user(email=LOCAL_OWNER_EMAIL, display_name="Owner")
    workspace = store.get_workspace_by_public_id(LOCAL_WORKSPACE_PUBLIC_ID)
    if workspace is None:
        workspace = store.create_workspace(
            name="Local",
            created_by_user_id=user["id"],
            public_id=LOCAL_WORKSPACE_PUBLIC_ID,
        )
    if store.get_membership(workspace_id=workspace["id"], user_id=user["id"]) is None:
        store.add_membership(workspace_id=workspace["id"], user_id=user["id"], role="owner")
    return _session_payload(store, user, workspace)


@router.post("/auth/signup", status_code=201)
def signup(payload: SignupRequest, request: Request) -> dict[str, Any]:
    store = _store(request)
    try:
        user = store.create_user(email=payload.email, display_name=payload.display_name)
    except IntegrityError:
        # S1: one human = one email, enforced by the DB.
        raise HTTPException(status_code=409, detail="email is already registered")
    store.add_password_credential(
        user_id=user["id"],
        email_normalized=user["email_normalized"],
        password_hash=hash_password(payload.password),
    )
    owner_label = payload.display_name.strip() or user["email_normalized"].split("@")[0]
    workspace = store.create_workspace(
        name=f"{owner_label}'s workspace", created_by_user_id=user["id"]
    )
    store.add_membership(workspace_id=workspace["id"], user_id=user["id"], role="owner")
    issued = store.issue_session(user_id=user["id"])
    return {
        "token": issued["token"],
        "expires_at": issued["expires_at"],
        "user": {
            "id": user["id"],
            "email": user["email_normalized"],
            "display_name": user["display_name"],
        },
        "workspace": {
            "public_id": workspace["public_id"],
            "name": workspace["name"],
            "tier": workspace["tier"],
        },
    }


@router.post("/auth/login")
def login(payload: LoginRequest, request: Request) -> dict[str, Any]:
    store = _store(request)
    invalid = HTTPException(status_code=401, detail="invalid credentials")

    retry_after = throttle.retry_after_seconds(store, payload.email)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail="too many login attempts",
            headers={"Retry-After": str(retry_after)},
        )

    def _failed() -> HTTPException:
        throttle.note_login_failure(store, payload.email)
        return invalid

    credential = store.find_password_credential(payload.email)
    if credential is None or not credential.get("password_hash"):
        raise _failed()
    if not verify_password(credential["password_hash"], payload.password):
        raise _failed()
    user = store.get_user(credential["user_id"])
    if user is None or user.get("status") != "active":
        raise _failed()
    throttle.note_login_success(store, payload.email)
    issued = store.issue_session(user_id=user["id"])
    return {
        "token": issued["token"],
        "expires_at": issued["expires_at"],
        "user": {
            "id": user["id"],
            "email": user["email_normalized"],
            "display_name": user["display_name"],
        },
    }


@router.post("/auth/logout")
def logout(
    request: Request, session: dict[str, Any] = Depends(current_session)
) -> dict[str, Any]:
    raw_token = request.headers.get("authorization", "").partition(" ")[2].strip()
    return {"revoked": _store(request).revoke_session(raw_token)}


@router.get("/api/user/account")
def user_account(
    request: Request, session: dict[str, Any] = Depends(current_session)
) -> dict[str, Any]:
    """The session decides whose account this is — any client-supplied
    user id (query, header, body) is ignored by construction."""
    user = _store(request).get_user(session["user_id"])
    if user is None:
        raise HTTPException(status_code=401, detail="invalid or expired session")
    return {
        "user": {
            "id": user["id"],
            "email": user["email_normalized"],
            "display_name": user["display_name"],
            "status": user["status"],
            "created_at": user["created_at"],
        }
    }
