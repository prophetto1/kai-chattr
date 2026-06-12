"""Explicit endpoint contract registry (sim-style, contract-first).

Every safe HTTP route owns exactly one EndpointContract keyed by
``(method, path_template)``. Routes may no longer rely on path-prefix
heuristics for auth/scope/observability classification — the registry is
the source of truth and ``tests/test_endpoint_contract_registry.py``
enforces full coverage, no orphans, and the canonical URL rules
(no user identifiers in paths; workspace_session routes carry both
tenant and session params).

``canonical_status`` vocabulary:
- ``canonical``       — conforms to the target product canon (scoped, durable)
- ``legacy``          — live local-runtime surface awaiting canonical rescope
- ``internal``        — infra/agent-wrapper lane, not a product surface
- ``redirect_helper`` — convenience alias permitted by canon rule 7
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from fastapi import FastAPI

from app.endpoint_contract import (
    EndpointAuth,
    EndpointProxy,
    EndpointSurface,
    SAFE_METHODS,
    IGNORED_FASTAPI_ROUTES,
)

EndpointScope = Literal[
    "public",            # unauthenticated surface
    "user",              # authenticated user, no tenant context
    "workspace",         # tenant-scoped
    "workspace_session", # tenant + chat-session scoped
    "runtime",           # agent/wrapper/process control lane
    "global",            # pre-tenancy single-room surface (legacy)
]
CanonicalStatus = Literal["canonical", "legacy", "internal", "redirect_helper"]


@dataclass(frozen=True)
class EndpointContract:
    method: str
    path: str
    auth: EndpointAuth
    proxy: EndpointProxy
    surface: EndpointSurface
    scope: EndpointScope
    canonical_status: CanonicalStatus
    data_owner: str
    tenant_param: str | None = None
    session_param: str | None = None
    request_model: str = "untyped"
    response_model: str = "untyped"


_REGISTRY: dict[tuple[str, str], EndpointContract] = {}


def define_endpoint_contract(contract: EndpointContract) -> EndpointContract:
    key = (contract.method, contract.path)
    if key in _REGISTRY:
        raise ValueError(f"duplicate endpoint contract for {key}")
    _REGISTRY[key] = contract
    return contract


def contract_for(method: str, path: str) -> EndpointContract | None:
    return _REGISTRY.get((method.upper(), path))


def all_contracts() -> tuple[EndpointContract, ...]:
    return tuple(_REGISTRY.values())


def coverage_status(app: FastAPI) -> dict:
    from fastapi.routing import APIRoute

    live: set[tuple[str, str]] = set()
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        for method in route.methods or set():
            if method in SAFE_METHODS and (method, route.path) not in IGNORED_FASTAPI_ROUTES:
                if not route.path.startswith(("/openapi", "/docs", "/redoc")):
                    live.add((method, route.path))
    contracted = {key for key in live if key in _REGISTRY}
    return {
        "total_routes": len(live),
        "contracted_routes": len(contracted),
        "uncontracted_routes": sorted(f"{m} {p}" for (m, p) in live - set(_REGISTRY)),
        "orphan_contracts": sorted(f"{m} {p}" for (m, p) in set(_REGISTRY) - live),
    }


def _c(
    method: str,
    path: str,
    auth: EndpointAuth,
    surface: EndpointSurface,
    scope: EndpointScope,
    status: CanonicalStatus,
    owner: str,
    *,
    proxy: EndpointProxy = "api",
    tenant: str | None = None,
    session: str | None = None,
    req: str = "untyped",
    res: str = "untyped",
) -> None:
    define_endpoint_contract(EndpointContract(
        method=method, path=path, auth=auth, proxy=proxy, surface=surface,
        scope=scope, canonical_status=status, data_owner=owner,
        tenant_param=tenant, session_param=session,
        request_model=req, response_model=res,
    ))


# --- identity (canonical: follows auth/user-scope canon) ---
_c("POST", "/auth/signup", "public", "identity", "user", "canonical", "identity_db.auth")
_c("POST", "/auth/login", "public", "identity", "user", "canonical", "identity_db.auth")
_c("POST", "/auth/logout", "user-bearer", "identity", "user", "canonical", "identity_db.auth")
_c("GET", "/auth/oauth/{provider_name}", "public", "identity", "user", "canonical", "identity_db.auth")
_c("GET", "/auth/oauth/{provider_name}/callback", "public", "identity", "user", "canonical", "identity_db.auth")
_c("GET", "/api/user/account", "user-bearer", "identity", "user", "canonical", "identity_db.users")
_c("POST", "/w/{workspace_public_id}/invitations", "user-bearer", "identity", "workspace", "canonical", "identity_db.workspaces", tenant="workspace_public_id")

# --- system / contract / observability / runtime topology (internal infra) ---
_c("GET", "/healthz", "public", "system-health", "public", "internal", "runtime", proxy="direct-backend")
_c("GET", "/schemas/pydantic/status", "public", "contract-status", "public", "internal", "contract code", proxy="direct-backend")
_c("GET", "/schemas/endpoint-contracts/status", "public", "contract-status", "public", "internal", "endpoint registry", proxy="direct-backend", res="coverage_status dict")
_c("GET", "/observability/endpoints", "public", "observability", "public", "internal", "endpoint registry", proxy="observability")
_c("GET", "/observability/status", "public", "observability", "public", "internal", "otel/jsonl exporters", proxy="observability")
_c("GET", "/api/runtime/ports", "public", "runtime-topology", "public", "internal", "runtime contract")
_c("GET", "/uploads/{filename}", "public", "upload-assets", "global", "legacy", "uploads dir", proxy="uploads")

# --- agent wrapper lanes (internal runtime control) ---
_c("POST", "/api/register", "local-or-remote-agent-token", "agent-runtime", "runtime", "internal", "runtime registry")
_c("POST", "/api/deregister/{name}", "local-or-agent-bearer", "agent-runtime", "runtime", "internal", "runtime registry")
_c("POST", "/api/heartbeat/{agent_name}", "local-or-agent-bearer", "agent-runtime", "runtime", "internal", "runtime registry")
_c("GET", "/api/poll/{agent_name}", "local-or-agent-bearer", "agent-runtime", "runtime", "internal", "agent queue JSONL")
_c("POST", "/api/label/{name}", "session", "agent-runtime", "runtime", "internal", "runtime registry")
_c("DELETE", "/api/hat/{agent_name}", "session", "agent-runtime", "runtime", "internal", "runtime registry")
_c("POST", "/api/trigger-agent", "session", "agent-runtime", "runtime", "internal", "agent queue JSONL")
_c("GET", "/api/status", "session", "agent-runtime", "runtime", "internal", "runtime registry")
_c("GET", "/api/roles", "session-or-local-agent-bearer", "agent-runtime", "runtime", "internal", "roles store")
_c("POST", "/api/roles/{agent_name}", "session-or-local-agent-bearer", "agent-runtime", "runtime", "internal", "roles store")
_c("GET", "/api/mcp/tools", "session", "mcp", "runtime", "internal", "mcp bridge")

# --- terminal / approval relay (legacy local-runtime product surface) ---
_c("POST", "/api/terminal/{agent_name}", "session-or-agent-bearer", "terminal", "runtime", "legacy", "in-memory snapshots + room lane")
_c("GET", "/api/terminal/{agent_name}", "session-or-agent-bearer", "terminal", "runtime", "legacy", "in-memory snapshots")
_c("POST", "/api/terminal/{agent_name}/input", "session-or-agent-bearer", "terminal", "runtime", "legacy", "input JSONL lane")
_c("GET", "/api/terminal-runtimes", "session", "agent-runtime", "runtime", "legacy", "in-memory snapshots + registry")
_c("GET", "/api/terminals", "session", "agent-runtime", "runtime", "legacy", "terminal session manager")

# --- launchers / runtime config (legacy local-runtime control surface) ---
_c("GET", "/api/launchers/profiles", "session", "launcher", "runtime", "legacy", "launcher profiles", res="LauncherProfilesResponse")
_c("POST", "/api/launchers/dry-run", "session", "launcher", "runtime", "legacy", "launcher profiles", res="LauncherDryRunResponse")
_c("POST", "/api/launchers/start", "session", "launcher", "runtime", "legacy", "launcher processes")
_c("POST", "/api/launchers/stop", "session", "launcher", "runtime", "legacy", "launcher processes")
_c("GET", "/api/launchers/status", "session", "launcher", "runtime", "legacy", "launcher processes")
_c("GET", "/api/launchers/agent/preflight", "session", "launcher", "runtime", "legacy", "launcher profiles", res="AgentLauncherPreflightResponse")
_c("POST", "/api/launchers/agent", "session", "launcher", "runtime", "legacy", "launcher processes", req="LauncherStartRequest", res="AgentLauncherStartResponse")
_c("GET", "/api/agents/runtime-config", "session", "agent-runtime", "runtime", "legacy", "config.local.toml", res="AgentRuntimeConfigList")
_c("PUT", "/api/agents/{agent}/runtime-config", "session", "agent-runtime", "runtime", "legacy", "config.local.toml", req="TransportUpdateRequest", res="AgentRuntimeConfig")

# --- room lane: messages / proposals (legacy, pre-tenancy single room) ---
_c("GET", "/api/messages", "session-or-agent-bearer", "agent-runtime", "global", "legacy", "MessageStore JSONL")
_c("POST", "/api/send", "session-or-agent-bearer", "agent-runtime", "global", "legacy", "MessageStore JSONL")
_c("POST", "/api/messages/{msg_id}/demote", "session", "agent-runtime", "global", "legacy", "MessageStore JSONL")
_c("POST", "/api/messages/{msg_id}/resolve_decision", "session", "agent-runtime", "global", "legacy", "MessageStore JSONL")
_c("POST", "/api/messages/{msg_id}/resolve_rule_proposal", "session", "agent-runtime", "global", "legacy", "MessageStore JSONL")
_c("POST", "/api/messages/{msg_id}/demote_rule_proposal", "session", "agent-runtime", "global", "legacy", "MessageStore JSONL")

# --- board stores (legacy, pre-tenancy) ---
_c("GET", "/api/jobs", "session", "board", "global", "legacy", "jobs store")
_c("POST", "/api/jobs", "session", "board", "global", "legacy", "jobs store")
_c("POST", "/api/jobs/reorder", "session", "board", "global", "legacy", "jobs store")
_c("DELETE", "/api/jobs/{job_id}", "session", "board", "global", "legacy", "jobs store")
_c("PATCH", "/api/jobs/{job_id}", "session", "board", "global", "legacy", "jobs store")
_c("GET", "/api/jobs/{job_id}/messages", "session", "board", "global", "legacy", "jobs store")
_c("POST", "/api/jobs/{job_id}/messages", "session", "board", "global", "legacy", "jobs store")
_c("DELETE", "/api/jobs/{job_id}/messages/{msg_id}", "session", "board", "global", "legacy", "jobs store")
_c("POST", "/api/jobs/{job_id}/messages/{msg_index}/resolve", "session", "board", "global", "legacy", "jobs store")
_c("GET", "/api/locked", "session", "board", "global", "legacy", "locked store")
_c("POST", "/api/locked", "session", "board", "global", "legacy", "locked store")
_c("DELETE", "/api/locked/{locked_id}", "session", "board", "global", "legacy", "locked store")
_c("PATCH", "/api/locked/{locked_id}", "session", "board", "global", "legacy", "locked store")
_c("GET", "/api/pins", "session", "board", "global", "legacy", "pins/todos store")
_c("POST", "/api/pins", "session", "board", "global", "legacy", "pins/todos store")
_c("DELETE", "/api/pins", "session", "board", "global", "legacy", "pins/todos store")
_c("DELETE", "/api/pins/{message_id}", "session", "board", "global", "legacy", "pins/todos store")
_c("PATCH", "/api/pins/{message_id}", "session", "board", "global", "legacy", "pins/todos store")
_c("GET", "/api/rules", "session", "board", "global", "legacy", "rules store")
_c("POST", "/api/rules", "session", "board", "global", "legacy", "rules store")
_c("GET", "/api/rules/active", "session-or-agent-bearer", "board", "global", "legacy", "rules store")
_c("POST", "/api/rules/agent_sync/{agent_name}", "session-or-agent-bearer", "board", "global", "legacy", "rules store")
_c("GET", "/api/rules/freshness", "session-or-agent-bearer", "board", "global", "legacy", "rules store")
_c("POST", "/api/rules/remind", "session-or-agent-bearer", "board", "global", "legacy", "rules store")
_c("DELETE", "/api/rules/{rule_id}", "session-or-agent-bearer", "board", "global", "legacy", "rules store")
_c("PATCH", "/api/rules/{rule_id}", "session-or-agent-bearer", "board", "global", "legacy", "rules store")
_c("GET", "/api/schedules", "session", "board", "global", "legacy", "schedules store")
_c("POST", "/api/schedules", "session", "board", "global", "legacy", "schedules store")
_c("DELETE", "/api/schedules/{schedule_id}", "session", "board", "global", "legacy", "schedules store")
_c("PATCH", "/api/schedules/{schedule_id}/toggle", "session", "board", "global", "legacy", "schedules store")
_c("GET", "/api/sessions/active", "session", "board", "global", "legacy", "sessions store")
_c("GET", "/api/sessions/active-all", "session", "board", "global", "legacy", "sessions store")
_c("POST", "/api/sessions/request-draft", "session", "board", "global", "legacy", "sessions store")
_c("POST", "/api/sessions/save-draft", "session", "board", "global", "legacy", "sessions store")
_c("POST", "/api/sessions/start", "session", "board", "global", "legacy", "sessions store")
_c("GET", "/api/sessions/templates", "session", "board", "global", "legacy", "sessions store")
_c("DELETE", "/api/sessions/templates/{template_id}", "session", "board", "global", "legacy", "sessions store")
_c("POST", "/api/sessions/{session_id}/end", "session", "board", "global", "legacy", "sessions store")
_c("GET", "/api/right-rail/capabilities", "session", "board", "global", "legacy", "board capability flags")

# --- home start (legacy, pre-tenancy) ---
_c("POST", "/api/conversations", "session", "home-start", "global", "legacy", "home_start store")
_c("GET", "/api/conversations/recent", "session", "home-start", "global", "legacy", "home_start store")
_c("GET", "/api/git/branches/search", "session", "home-start", "global", "legacy", "host git")
_c("GET", "/api/git/repositories/search", "session", "home-start", "global", "legacy", "host git")
_c("GET", "/api/repositories", "session", "home-start", "global", "legacy", "host git")
_c("GET", "/api/repositories/search", "session", "home-start", "global", "legacy", "host git")
_c("GET", "/api/repositories/{repository:path}/branches", "session", "home-start", "global", "legacy", "host git")
_c("GET", "/api/suggested-tasks", "session", "home-start", "global", "legacy", "home_start store")

# --- workspace files (legacy, pre-tenancy; host filesystem) ---
_c("GET", "/api/workspace/changes", "session", "agent-runtime", "global", "legacy", "host git worktree")
_c("GET", "/api/workspace/diff", "session", "agent-runtime", "global", "legacy", "host git worktree")
_c("GET", "/api/workspace/diff-document", "session", "agent-runtime", "global", "legacy", "host git worktree")
_c("GET", "/api/workspace/file", "session", "agent-runtime", "global", "legacy", "host filesystem")
_c("PUT", "/api/workspace/file", "session", "agent-runtime", "global", "legacy", "host filesystem")
_c("GET", "/api/workspace/tree", "session", "agent-runtime", "global", "legacy", "host filesystem")

# --- model providers (K-layer registry, MDA Deployment record; tenancy
# ruling pending — global+legacy until Jon decides platform-global vs
# workspace-scoped; untyped models = visible debt, Pydantic pass queued) ---
_c("GET", "/api/model-providers", "session", "board", "global", "legacy", "model_providers store (JSON/db)")
_c("POST", "/api/model-providers", "session", "board", "global", "legacy", "model_providers store (JSON/db)")
_c("GET", "/api/model-providers/{provider_id}", "session", "board", "global", "legacy", "model_providers store (JSON/db)")
_c("PATCH", "/api/model-providers/{provider_id}", "session", "board", "global", "legacy", "model_providers store (JSON/db)")
_c("DELETE", "/api/model-providers/{provider_id}", "session", "board", "global", "legacy", "model_providers store (JSON/db)")

# --- settings / themes / platform / archive / version (legacy) ---
_c("GET", "/api/settings", "session", "settings", "global", "legacy", "settings store")
_c("PATCH", "/api/settings", "session", "settings", "global", "legacy", "settings store")
_c("GET", "/api/settings/schema", "session", "settings", "global", "legacy", "settings schema")
_c("GET", "/api/themes", "session", "theme", "global", "legacy", "theme store")
_c("POST", "/api/open-path", "session", "platform", "global", "legacy", "host platform")
_c("GET", "/api/platform", "session", "platform", "global", "legacy", "host platform")
_c("POST", "/api/upload", "session", "archive", "global", "legacy", "uploads dir")
_c("GET", "/api/export", "session", "archive", "global", "legacy", "stores export")
_c("POST", "/api/import", "session", "archive", "global", "legacy", "stores import")
_c("GET", "/api/version_check", "session", "version", "global", "legacy", "package metadata")
