"""Endpoint contract registry gates (plan: sim-style endpoint contract, Tasks 1-3).

The fixture `fixtures/endpoint_route_inventory.txt` is the canonical route
inventory (one "METHOD /path" line per safe route). These tests enforce:
drift-lock between fixture and live app, exactly one explicit contract per
route (no orphans), and the canonical URL rules (no user ids in paths;
workspace_session scope requires both tenant and session params).
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi.routing import APIRoute  # noqa: E402

from app import main as api_main  # noqa: E402

FIXTURE = Path(__file__).parent / "fixtures" / "endpoint_route_inventory.txt"

SAFE_METHODS = {"DELETE", "GET", "PATCH", "POST", "PUT"}
DOC_PREFIXES = ("/openapi", "/docs", "/redoc")


def _live_routes() -> set[tuple[str, str]]:
    routes: set[tuple[str, str]] = set()
    for route in api_main.app.routes:
        if not isinstance(route, APIRoute):
            continue
        if route.path.startswith(DOC_PREFIXES):
            continue
        for method in route.methods or set():
            if method in SAFE_METHODS:
                routes.add((method, route.path))
    return routes


def _fixture_routes() -> set[tuple[str, str]]:
    routes: set[tuple[str, str]] = set()
    for line in FIXTURE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        method, path = line.split(" ", 1)
        routes.add((method, path))
    return routes


def test_fixture_matches_live_routes() -> None:
    live = _live_routes()
    fixture = _fixture_routes()
    missing_from_fixture = sorted(live - fixture)
    gone_from_app = sorted(fixture - live)
    assert not missing_from_fixture, (
        "Routes exist without inventory entries (add contract + fixture line): "
        f"{missing_from_fixture}"
    )
    assert not gone_from_app, (
        f"Fixture lists routes the app no longer serves: {gone_from_app}"
    )


def test_every_route_has_exactly_one_contract() -> None:
    from app.endpoint_contract_registry import all_contracts, contract_for

    live = _live_routes()
    uncontracted = sorted(
        (m, p) for (m, p) in live if contract_for(m, p) is None
    )
    assert not uncontracted, f"Routes without an endpoint contract: {uncontracted}"

    orphans = sorted(
        (c.method, c.path) for c in all_contracts() if (c.method, c.path) not in live
    )
    assert not orphans, f"Contracts registered for routes that do not exist: {orphans}"

    keys = [(c.method, c.path) for c in all_contracts()]
    assert len(keys) == len(set(keys)), "Duplicate (method, path) contract entries"


def test_no_user_identifier_in_any_route_path() -> None:
    from app.endpoint_contract_registry import all_contracts

    offenders = [
        (c.method, c.path)
        for c in all_contracts()
        if "user_id" in c.path or "{userId}" in c.path
    ]
    assert not offenders, f"User identifiers must never appear in URL paths: {offenders}"


def test_workspace_session_scope_requires_tenant_and_session_params() -> None:
    from app.endpoint_contract_registry import all_contracts

    broken = []
    for c in all_contracts():
        if c.scope == "workspace_session":
            if not c.tenant_param or not c.session_param:
                broken.append((c.method, c.path, "missing tenant/session param"))
            else:
                if f"{{{c.tenant_param}}}" not in c.path or f"{{{c.session_param}}}" not in c.path:
                    broken.append((c.method, c.path, "params not in path template"))
    assert not broken, f"workspace_session contracts must carry both params: {broken}"


def test_canonical_routes_declare_scope_discipline() -> None:
    from app.endpoint_contract_registry import all_contracts

    broken = [
        (c.method, c.path)
        for c in all_contracts()
        if c.canonical_status == "canonical"
        and c.scope in {"workspace", "workspace_session"}
        and not c.tenant_param
    ]
    assert not broken, f"Canonical tenant-scoped routes must declare tenant_param: {broken}"


def test_canonical_routes_lock_public_identifier_names() -> None:
    from app.endpoint_contract_registry import all_contracts

    broken = []
    for c in all_contracts():
        if c.canonical_status != "canonical":
            continue
        if "user_id" in c.path:
            broken.append((c.method, c.path, "user identifier in path"))
        if c.scope in {"workspace", "workspace_session"} and c.tenant_param != "workspace_public_id":
            broken.append((c.method, c.path, f"tenant_param must be workspace_public_id, got {c.tenant_param!r}"))
        if c.scope == "workspace_session" and c.session_param != "session_hash":
            broken.append((c.method, c.path, f"session_param must be session_hash, got {c.session_param!r}"))
    assert not broken, f"Canonical route identifier rules violated: {broken}"
