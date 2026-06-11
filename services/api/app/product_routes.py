"""Browser product route helpers returned by API responses."""

from __future__ import annotations

from urllib.parse import quote


DEFAULT_WORKSPACE_PUBLIC_ID = "local"


def workspace_session_url(session_hash: str, workspace_public_id: str = DEFAULT_WORKSPACE_PUBLIC_ID) -> str:
    workspace = quote(workspace_public_id, safe="")
    session = quote(session_hash, safe="")
    return f"/w/{workspace}/sessions/{session}"
