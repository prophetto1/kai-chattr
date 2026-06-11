"""The workspace tenancy seam (Plan 1.5, frozen contract).

``WorkspaceContext`` + ``resolve_workspace_context`` are THE single
enforcement seam every workspace-scoped route depends on (locked):

1. resolve   — workspace public id from the path -> internal workspace, or 404
2. authorize — the session user's active membership, or 404 (never 403:
               a non-member must not be able to distinguish "exists but not
               mine" from "does not exist")
3. translate — handlers receive internal ids + role; client-supplied tenant
               ids never reach handler logic.
"""

from __future__ import annotations

import uuid
from typing import Any, Literal

from fastapi import Depends, HTTPException, Request
from pydantic import BaseModel

from app.auth.deps import current_session


class WorkspaceContext(BaseModel):
    user_id: str
    workspace_id: str
    workspace_public_id: str
    membership_role: Literal["owner", "admin", "member"]


def resolve_workspace_context(
    workspace_public_id: str,
    request: Request,
    session: dict[str, Any] = Depends(current_session),
) -> WorkspaceContext:
    store = request.app.state.identity_store
    not_found = HTTPException(status_code=404, detail="not found")

    workspace = store.get_workspace_by_public_id(workspace_public_id)
    if workspace is None or workspace.get("status") != "active":
        raise not_found
    membership = store.get_membership(
        workspace_id=workspace["id"], user_id=session["user_id"]
    )
    if membership is None or membership.get("status") != "active":
        raise not_found
    return WorkspaceContext(
        user_id=session["user_id"],
        workspace_id=workspace["id"],
        workspace_public_id=workspace["public_id"],
        membership_role=membership["role"],
    )


def workspace_scoped(query, model, ctx: WorkspaceContext):
    """Append the authorized workspace filter so a handler cannot read across
    tenants even by mistake. ``model`` must carry a ``workspace_id`` column."""
    return query.where(model.workspace_id == uuid.UUID(ctx.workspace_id))
