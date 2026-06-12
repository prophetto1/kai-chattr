"""Endpoint contract metadata for the kai-chattr FastAPI runtime."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from fastapi import FastAPI
from fastapi.routing import APIRoute


EndpointAuth = Literal[
    "public",
    "user-bearer",
    "session",
    "session-or-local-agent-bearer",
    "session-or-agent-bearer",
    "local-or-agent-bearer",
    "local-or-remote-agent-token",
]
EndpointProxy = Literal[
    "api",
    "observability",
    "uploads",
    "direct-backend",
]
EndpointSurface = Literal[
    "agent-runtime",
    "api-docs",
    "archive",
    "board",
    "identity",
    "contract-status",
    "home-start",
    "launcher",
    "mcp",
    "observability",
    "platform",
    "runtime-topology",
    "settings",
    "system-health",
    "terminal",
    "theme",
    "upload-assets",
    "version",
]


SAFE_METHODS = frozenset({"DELETE", "GET", "PATCH", "POST", "PUT"})
IGNORED_FASTAPI_ROUTES = frozenset(
    {
        ("GET", "/docs"),
        ("GET", "/docs/oauth2-redirect"),
        ("GET", "/openapi.json"),
        ("GET", "/redoc"),
    }
)
ROUTE_TOKEN_PATTERN = re.compile(r"\{[^/{}]+\}")


@dataclass(frozen=True)
class EndpointPolicy:
    auth: EndpointAuth
    proxy: EndpointProxy
    surface: EndpointSurface


@dataclass(frozen=True)
class EndpointDefinition:
    method: str
    path: str
    route_name: str
    area: str
    operation: str
    purpose: str
    span_name: str
    auth: EndpointAuth
    proxy: EndpointProxy
    surface: EndpointSurface

    def to_observability_dict(self) -> dict[str, str]:
        return {
            "area": self.area,
            "auth": self.auth,
            "method": self.method,
            "operation": self.operation,
            "path": self.path,
            "proxy": self.proxy,
            "purpose": self.purpose,
            "route_name": self.route_name,
            "span_name": self.span_name,
            "surface": self.surface,
        }


def endpoint_definitions_for_app(app: FastAPI) -> list[EndpointDefinition]:
    definitions: list[EndpointDefinition] = []
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        for method in sorted(route.methods or set()):
            if method not in SAFE_METHODS or (method, route.path) in IGNORED_FASTAPI_ROUTES:
                continue
            definitions.append(endpoint_definition_from_route(method, route.path, route.name))
    return sorted(definitions, key=lambda endpoint: (endpoint.path, endpoint.method))


def endpoint_definition_from_route(method: str, path: str, route_name: str) -> EndpointDefinition:
    safe_method = method.upper()
    policy = endpoint_policy_for_path(safe_method, path)
    area = _area_for_path(path)
    operation = _operation_for_route(safe_method, path)
    noun = _noun_for_path(path)
    return EndpointDefinition(
        method=safe_method,
        path=path,
        route_name=route_name,
        area=area,
        operation=operation,
        purpose=_purpose_for_route(route_name, safe_method, path),
        span_name=f"kai_chattr.api.{noun}.{operation}",
        auth=policy.auth,
        proxy=policy.proxy,
        surface=policy.surface,
    )


def endpoint_policy_for_path(method: str, path: str) -> EndpointPolicy:
    if path == "/healthz":
        return EndpointPolicy("public", "direct-backend", "system-health")
    if path.startswith("/schemas/"):
        return EndpointPolicy("public", "direct-backend", "contract-status")
    if path.startswith("/observability/"):
        return EndpointPolicy("public", "observability", "observability")
    if path.startswith("/uploads/"):
        return EndpointPolicy("public", "uploads", "upload-assets")
    if path in {"/auth/signup", "/auth/login"} or path.startswith("/auth/oauth/"):
        return EndpointPolicy("public", "api", "identity")
    if path.startswith("/auth/") or path.startswith("/api/user/"):
        return EndpointPolicy("user-bearer", "api", "identity")
    if path.startswith("/w/") and path.endswith("/invitations"):
        return EndpointPolicy("user-bearer", "api", "identity")
    if path.startswith("/api/runtime/"):
        return EndpointPolicy("public", "api", "runtime-topology")
    if path == "/api/roles" or path.startswith("/api/roles/"):
        return EndpointPolicy("session-or-local-agent-bearer", "api", "agent-runtime")
    if path.startswith("/api/launchers/"):
        return EndpointPolicy("session", "api", "launcher")
    if path.startswith(("/api/git/", "/api/repositories", "/api/conversations", "/api/suggested-tasks")):
        return EndpointPolicy("session", "api", "home-start")
    if path in {"/api/register"}:
        return EndpointPolicy("local-or-remote-agent-token", "api", "agent-runtime")
    if path.startswith(("/api/deregister/", "/api/heartbeat/", "/api/poll/")):
        return EndpointPolicy("local-or-agent-bearer", "api", "agent-runtime")
    if path in {"/api/messages", "/api/send"} or path.startswith(("/api/rules/", "/api/terminal/")):
        return EndpointPolicy("session-or-agent-bearer", "api", _surface_for_api_path(path))
    if path.startswith("/api/settings"):
        return EndpointPolicy("session", "api", "settings")
    if path.startswith("/api/themes"):
        return EndpointPolicy("session", "api", "theme")
    if path.startswith("/api/version_check"):
        return EndpointPolicy("session", "api", "version")
    if path.startswith("/api/open-path") or path.startswith("/api/platform"):
        return EndpointPolicy("session", "api", "platform")
    if path.startswith(("/api/upload", "/api/export", "/api/import")):
        return EndpointPolicy("session", "api", "archive")
    if path.startswith("/api/mcp/"):
        return EndpointPolicy("session", "api", "mcp")
    return EndpointPolicy("session", "api", _surface_for_api_path(path))


def identify_endpoint(
    definitions: list[EndpointDefinition],
    method: str,
    path: str,
) -> EndpointDefinition | None:
    safe_method = method.upper()
    if safe_method not in SAFE_METHODS:
        return None
    for endpoint in definitions:
        if endpoint.method == safe_method and _template_matches_path(endpoint.path, path):
            return endpoint
    return None


def _surface_for_api_path(path: str) -> EndpointSurface:
    parts = _static_path_parts(path)
    area = parts[1] if len(parts) > 1 and parts[0] == "api" else ""
    if area in {"jobs", "locked", "model-providers", "pins", "rules", "schedules", "sessions"}:
        return "board"
    if area in {"terminal"}:
        return "terminal"
    if area in {"trigger-agent", "register", "deregister", "poll", "label", "heartbeat"}:
        return "agent-runtime"
    if area in {"messages", "send", "hat"}:
        return "agent-runtime"
    if area in {"right-rail"}:
        return "board"
    return "agent-runtime"


def _purpose_for_route(route_name: str, method: str, path: str) -> str:
    if route_name:
        words = route_name.replace("_", " ")
        return f"{words[0].upper()}{words[1:]}."
    return f"{_operation_for_route(method, path).title()} {path}."


def _area_for_path(path: str) -> str:
    parts = _static_path_parts(path)
    if not parts:
        return "root"
    if parts[0] == "api" and len(parts) > 1:
        return parts[1]
    return parts[0]


def _noun_for_path(path: str) -> str:
    parts = [
        part.replace("-", "_")
        for part in _static_path_parts(path)
        if part not in {"api"}
    ]
    return ".".join(parts) if parts else "root"


def _static_path_parts(path: str) -> list[str]:
    return [
        part
        for part in path.strip("/").split("/")
        if part and not (part.startswith("{") and part.endswith("}"))
    ]


def _operation_for_route(method: str, path: str) -> str:
    if method == "DELETE":
        return "delete"
    if method == "PATCH":
        return "update"
    if method == "POST":
        lowered = path.lower()
        if lowered.endswith("/restore"):
            return "restore"
        if lowered.endswith("/reorder"):
            return "reorder"
        if lowered.endswith("/toggle"):
            return "toggle"
        if lowered.endswith("/send"):
            return "send"
        if lowered.endswith("/publish"):
            return "publish"
        return "create"
    if method == "PUT":
        return "save"
    if method == "GET":
        parts = _static_path_parts(path)
        if path.endswith("/endpoints") or (parts and parts[-1].endswith("s")):
            return "list"
        return "read"
    return method.lower()


def _template_matches_path(template: str, path: str) -> bool:
    parts: list[str] = []
    cursor = 0
    for match in ROUTE_TOKEN_PATTERN.finditer(template):
        parts.append(re.escape(template[cursor:match.start()]))
        parts.append("[^/]+")
        cursor = match.end()
    parts.append(re.escape(template[cursor:]))
    regex = "^" + "".join(parts) + "$"
    return re.match(regex, path) is not None
