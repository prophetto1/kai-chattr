"""Security middleware helpers."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware


def create_security_middleware(
    *,
    get_config: Callable[[], dict[str, Any]],
    get_session_token: Callable[[], str],
    resolve_authenticated_agent: Callable[[Request], dict[str, Any] | None],
    remote_agent_token: Callable[[dict[str, Any]], str],
    request_remote_agent_token: Callable[[Request], str],
    validate_user_session: Callable[[str], Any | None] | None = None,
):
    class SecurityMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next):
            path = request.url.path
            current_cfg = get_config()
            port = _configured_port(current_cfg, "server", "port", 8840)
            frontend_cfg = current_cfg.get("frontend", {})
            frontend_host = frontend_cfg.get("dev_host", "127.0.0.1")
            frontend_port = _configured_port(current_cfg, "frontend", "dev_port", 8800)
            allowed_origins = {
                f"http://127.0.0.1:{port}",
                f"http://localhost:{port}",
                f"http://127.0.0.1:{frontend_port}",
                f"http://localhost:{frontend_port}",
            }
            if frontend_host not in ("127.0.0.1", "localhost"):
                allowed_origins.add(f"http://{frontend_host}:{frontend_port}")
            for origin in current_cfg.get("security", {}).get("allowed_origins", []):
                if isinstance(origin, str) and origin.strip():
                    allowed_origins.add(origin.strip().rstrip("/"))

            origin = request.headers.get("origin")
            cors_origin = origin if origin in allowed_origins else None

            if origin and not cors_origin:
                return JSONResponse({"error": "forbidden: origin not allowed"}, status_code=403)

            if request.method == "OPTIONS" and cors_origin:
                return _cors_preflight(cors_origin)

            # Uploads use random filenames and have path-traversal protection.
            # Frontend HTML and static assets are owned by apps/web, not this API.
            if path == "/healthz" or path == "/" or path.startswith(
                ("/uploads/", "/schemas/", "/observability/")
            ):
                return await _with_cors(call_next, request, cors_origin)

            # Identity + workspace-scoped endpoints authenticate at the route
            # layer (revocable bearer sessions + the tenancy dependency); the
            # legacy x-session-token gate does not apply to them.
            if path.startswith(("/auth/", "/api/user/", "/w/")):
                return await _with_cors(call_next, request, cors_origin)

            if path == "/api/roles" or path.startswith("/api/roles/"):
                client_ip = request.client.host if request.client else ""
                if client_ip in ("127.0.0.1", "::1", "localhost") or resolve_authenticated_agent(request):
                    return await _with_cors(call_next, request, cors_origin)

            if path.startswith(("/api/register", "/api/deregister/", "/api/heartbeat/", "/api/poll/")):
                client_ip = request.client.host if request.client else ""
                if client_ip not in ("127.0.0.1", "::1", "localhost"):
                    if path.startswith("/api/register"):
                        configured_token = remote_agent_token(current_cfg)
                        supplied_token = request_remote_agent_token(request)
                        if not configured_token or supplied_token != configured_token:
                            return _forbidden(
                                f"remote agent registration is not enabled for source {client_ip}."
                            )
                    elif not resolve_authenticated_agent(request):
                        return _forbidden(
                            f"remote agent request requires a valid bearer token. Source {client_ip} is not allowed."
                        )
                return await _with_cors(call_next, request, cors_origin)

            if path.startswith("/api/runtime/"):
                return await _with_cors(call_next, request, cors_origin)

            auth_header = request.headers.get("authorization", "")
            if auth_header.lower().startswith("bearer ") and (
                path in ("/api/messages", "/api/send")
                or path.startswith(("/api/rules/", "/api/terminal/"))
            ):
                if resolve_authenticated_agent(request):
                    return await _with_cors(call_next, request, cors_origin)

            # Phase 0 auth unification (plan v2, Task 1): the user-session gate
            # validates revocable auth_sessions (kcs_) — the launcher token is
            # no longer a product credential. Dual-accept window: the kcs_
            # token may arrive via Authorization: Bearer or the legacy
            # X-Session-Token header/query param; Task 7 retires the latter.
            bearer = ""
            auth_value = request.headers.get("authorization", "")
            if auth_value.lower().startswith("bearer "):
                bearer = auth_value.partition(" ")[2].strip()
            req_token = (
                request.headers.get("x-session-token")
                or bearer
                or request.query_params.get("token")
                or ""
            )
            session = validate_user_session(req_token) if (validate_user_session and req_token) else None
            if session is None:
                return JSONResponse(
                    {"error": "unauthorized: a valid auth session is required"},
                    status_code=401,
                )

            return await _with_cors(call_next, request, cors_origin)

    return SecurityMiddleware


def _configured_port(config: dict[str, Any], section: str, key: str, fallback: int) -> int:
    try:
        return int(config.get(section, {}).get(key, fallback))
    except (TypeError, ValueError):
        return fallback


def _forbidden(reason: str):
    return JSONResponse({"error": f"forbidden: {reason}"}, status_code=403)


async def _with_cors(call_next, request: Request, origin: str | None):
    response = await call_next(request)
    _add_cors_headers(response, origin)
    return response


def _cors_preflight(origin: str) -> Response:
    response = Response(status_code=204)
    _add_cors_headers(response, origin)
    response.headers["Access-Control-Allow-Methods"] = (
        "GET,POST,PATCH,DELETE,OPTIONS"
    )
    response.headers["Access-Control-Allow-Headers"] = (
        "authorization,content-type,x-agent-token,x-chattr-remote-token,"
        "x-agent-remote-token,x-session-token"
    )
    response.headers["Access-Control-Max-Age"] = "600"
    return response


def _add_cors_headers(response: Response, origin: str | None) -> None:
    if not origin:
        return
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Vary"] = "Origin"
