"""Workspace invitations (Plan 1.5 T6) — the first consumer of the tenancy seam.

`resolve_workspace_context` does the resolve→authorize→translate work: a
non-member never reaches the handler (404). Inside the workspace, role rules
apply (403 is correct here — the requester is already a proven member).

v1 invites an existing account by email into the workspace; token-based email
invitations for not-yet-registered users are a later slice (needs its own
table + delivery).
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError

from app.auth.tenancy import WorkspaceContext, resolve_workspace_context

router = APIRouter()


def register_routes(main_module) -> None:  # handlers are local to this module
    return None


class InvitationRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    role: Literal["member", "admin"] = "member"  # ownership is never granted by invite


@router.post("/w/{workspace_public_id}/invitations", status_code=201)
def invite_member(
    payload: InvitationRequest,
    request: Request,
    ctx: WorkspaceContext = Depends(resolve_workspace_context),
) -> dict[str, Any]:
    if ctx.membership_role not in ("owner", "admin"):
        raise HTTPException(status_code=403, detail="only owners or admins can invite")

    store = request.app.state.identity_store
    user = store.find_user_by_email(payload.email)
    if user is None or user.get("status") != "active":
        raise HTTPException(status_code=404, detail="no active account with that email")
    try:
        membership = store.add_membership(
            workspace_id=ctx.workspace_id, user_id=user["id"], role=payload.role
        )
    except IntegrityError:
        raise HTTPException(status_code=409, detail="already a member of this workspace")
    return {
        "membership": {
            "workspace_public_id": ctx.workspace_public_id,
            "user_id": membership["user_id"],
            "role": membership["role"],
            "status": membership["status"],
        }
    }
