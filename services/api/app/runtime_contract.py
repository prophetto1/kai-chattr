"""Runtime port and session-token contract helpers."""

from __future__ import annotations

import os
import secrets
from dataclasses import dataclass
from typing import Any

from fastapi import Request


DEFAULT_FRONTEND_PORT = 8800
DEFAULT_API_PORT = 8840
DEFAULT_MCP_HTTP_PORT = 8841
DEFAULT_MCP_SSE_PORT = 8842


@dataclass(frozen=True)
class SessionTokenContract:
    token: str
    source: str


def resolve_session_token_from_env(*, require_configured: bool = False) -> SessionTokenContract:
    token = (
        os.environ.get("KAI_CHATTR_SESSION_TOKEN", "").strip()
        or os.environ.get("CHATTR_SESSION_TOKEN", "").strip()
    )
    if token:
        return SessionTokenContract(token=token, source="environment")
    if require_configured:
        raise RuntimeError("KAI_CHATTR_SESSION_TOKEN is required for hosted API startup")
    return SessionTokenContract(token=secrets.token_hex(32), source="generated in-memory")


def configured_port(config: dict[str, Any], section: str, key: str, fallback: int) -> int:
    try:
        return int(config.get(section, {}).get(key, fallback))
    except (TypeError, ValueError):
        return fallback


def runtime_display_host(request: Request) -> str:
    host = request.url.hostname or "127.0.0.1"
    if host in {"0.0.0.0", "::"}:
        return "127.0.0.1"
    return host


def runtime_url(scheme: str, host: str, port: int, path: str = "") -> str:
    display_host = f"[{host}]" if ":" in host and not host.startswith("[") else host
    return f"{scheme}://{display_host}:{port}{path}"


def runtime_ports_payload(config: dict[str, Any], request: Request) -> dict[str, Any]:
    scheme = request.url.scheme or "http"
    host = runtime_display_host(request)
    api_port = configured_port(config, "server", "port", DEFAULT_API_PORT)
    frontend_port = configured_port(config, "frontend", "dev_port", DEFAULT_FRONTEND_PORT)
    http_port = configured_port(config, "mcp", "http_port", DEFAULT_MCP_HTTP_PORT)
    sse_port = configured_port(config, "mcp", "sse_port", DEFAULT_MCP_SSE_PORT)

    return {
        "mode": "local",
        "host": host,
        "ports": {
            "frontend": {
                "label": "Frontend",
                "port": frontend_port,
                "url": runtime_url(scheme, host, frontend_port),
                "state": "external",
            },
            "api": {
                "label": "API/WS",
                "port": api_port,
                "url": runtime_url(scheme, host, api_port),
                "state": "connected",
            },
            "mcp_http": {
                "label": "MCP HTTP",
                "port": http_port,
                "url": runtime_url(scheme, host, http_port, "/mcp"),
                "state": "configured",
            },
            "mcp_sse": {
                "label": "MCP SSE",
                "port": sse_port,
                "url": runtime_url(scheme, host, sse_port, "/sse"),
                "state": "configured",
            },
        },
    }
