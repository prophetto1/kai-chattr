# services/api Skeleton Implementation Plan

**Goal:** Stand up `kai-chattr/services/api` as a clean, containerizable Python (FastAPI/uv) "walking skeleton" — a relocatable agent-runtime ("A") whose *only* interface is a typed-HTTP + WebSocket API and which owns its own SQLite — runnable on `localhost:8880`, with deny-by-default dependency governance wired. **No legacy chattr logic is copied in this slice.**

**Architecture:** Mirror the model repo `blockdata/services/api` layout (`app/` package, `pyproject.toml` under `uv`, external `UV_PROJECT_ENVIRONMENT`). Establish the control-plane↔runtime seam (typed-HTTP + WebSocket) and the runtime-owns-SQLite principle so the same service runs in all three deployment shapes (local · cloud-UI→local · full-cloud-namespace) with no fork. Frontend (`apps/web`) and all coordination/MCP/PTY logic are later outside-in slices.

**Tech Stack:** Python ≥3.11, FastAPI, uvicorn[standard] (WebSocket), pydantic-settings, stdlib `sqlite3`, `uv` (toolchain), ruff, pytest, httpx (test client), Docker.

**Status:** Draft
**Author:** Jon (via Claude, initiating-a-new-task → investigating-and-writing-plan)
**Date:** 2026-05-31

---

## Pre-Implementation Contract

No major product, API, observability, persistence, or inventory decision may be improvised during implementation. If any locked item below must change, stop and revise this plan first.

## Locked Product Decisions

1. **Package layout mirrors the model repo** `blockdata/services/api`: `services/api/app/` (a flat package with `__init__.py`), **not** a `src/chattr_api/` layout. (This supersedes the `src/chattr_api/` sketch in `apps/devdocs/content/migration/repo-structure.mdx`; that page gets a one-line correction as Task 9.)
2. **The only interface to the frontend is a versioned typed-HTTP + WebSocket API.** No in-process coupling, no assumption the frontend is co-located. This is the relocatable seam that makes local/cloud the same code.
3. **The runtime owns its SQLite.** The DB path is env-configured; the service creates/opens its own SQLite file. No shared/remote DB in this slice.
4. **Containerizable from day one:** env-based config only (no hardcoded paths/hosts), a working `Dockerfile`, and a `/health` that a container orchestrator can probe.
5. **Dependencies enter `governance/allowed-deps.json` one slice at a time** and are enforced by gates. This slice adds exactly the skeleton deps.
6. **No legacy chattr code is copied.** `core/`, `sessions/`, `agents/`, `mcp/`, `wrappers/` are reserved (empty `__init__.py` packages) for later slices; this slice copies none of their logic.
7. **SQLite via stdlib `sqlite3`** for this slice. SQLAlchemy + Alembic are deferred to the memory-substrate slice (ADR 0001 invariant #6).
8. **No Turborepo.** Build orchestration stays plain **pnpm-workspaces** (matches blockdata + current kai-chattr). `turbo` is a future explicit decision + allowlist entry, never a default — do not introduce `turbo.json`.
9. **Package name locked = `app`** (distribution name `kai-chattr-api`), mirroring `blockdata/services/api`. This resolves the `chattr_api`/`kai_chattr_api` drift **before** any import-rewrite.
10. **`packages/schemas` consumption seam:** the JSON-Schema files are the single source of truth; the Python service reads them **by path at runtime** (jsonschema validation), and TS imports the same JSON. **Not** copied, **not** codegen'd. (Locked now; exercised in the later schemas slice.)
11. **`UV_PROJECT_ENVIRONMENT` resolution by context:** local dev → an env **outside** the checkout (cross-drive hardlink avoidance, per repo-process); CI → an **ephemeral uv-managed** env (`uv sync`, no external path); Fly container → the **container *is* the env** (`uv sync` into the image, no external path). The "outside the checkout" rule is local-dev only.
12. **Future Letta memory substrate home = `services/memory/`** (reserved, empty) — a cross-repo-shareable service per ADR 0001, **not** buried in `services/api/app/mcp/`. Acknowledged now so it isn't retrofitted later.

## Gate 0 — Contract-encode (governance-first, BLOCKING)

Per the blockdata discipline — **decide → encode contract → `check-contracts` green → then render code** — the `services/api` layout + naming MUST be encoded into the contracts and verified **before any `app/` source is committed**. This closes the code-before-contract inversion.

1. **Governance lane encodes** the locked layout/naming (Decisions 1, 9, 12 above) into `governance/contracts/repo-process.json` ("Imports & path conventions" + "File & directory naming" open-items → `services/api/app/<domain>/`, package `app`, dist `kai-chattr-api`) and `backend-api.json` ("router layout + path conventions" + "error envelope" open-items → routes in `app/api/`, system unprefixed + product under `/v1`, error envelope `{"error":{"code","message"}}`).
2. **Port the gate infra** from blockdata into `governance/`: `check-contracts.mjs`, `check-python-deps.py`, `schemas/{contract,registry}.schema.json`, and **`ajv`** (root devDep + `tooling` allowlist) which `check-contracts` requires.
2a. **(Amendment 2026-05-31 — Option A, pre-existing gaps found when porting the gate) Fix the baseline so the gates can be green:** (i) add the `apps/devdocs` key to `allowed-deps.json` (copied from blockdata) — its 18 deps were shipped but never allowlisted, so `check-deps` was failing; (ii) **relax `contract.schema.json`** so `status: "planned"` contracts may have empty `rules` (kai-chattr's `data.json` is legitimately rule-less until its slice lands). kai-chattr's governance gates were never actually green; this slice makes them green.
3. **`check-contracts` + `check-deps` + `check-python-deps` all GREEN** (regenerate the generated contract docs after editing contracts).

**No `app/` source is committed until Gate 0 is green.** This is the governance lane (another agent) — coordinate; Tasks 1+ assume Gate 0 passed. (This gate, plus the `check-python-deps.py` port in Task 3, are the two governance-lane couplings of this slice.)

## Manifest

### Platform API

| Verb | Path | Action | Status |
|------|------|--------|--------|
| GET | `/health` | Liveness + SQLite reachability probe | **New** |
| WS  | `/ws` | Minimal echo/ping — establishes the WebSocket half of the seam | **New** |

#### New endpoint contracts

`GET /health`
- Auth: none (public liveness probe)
- Request: no body
- Response `200`: `{"status": "ok", "service": "kai-chattr-api", "version": "<app version>", "db": "ok"}`
- On SQLite failure: `503` with the locked error envelope, `db: "error"`
- Touches: the runtime's own SQLite file (one `SELECT 1`)

`WS /ws`
- Auth: none in this slice (loopback only; security middleware lands with the first real endpoint — see zero-cases)
- Protocol: client connects, sends a text frame, server replies `{"echo": "<text>"}` as JSON text; server sends `{"type":"hello"}` on connect
- Purpose: prove bidirectional WS works (the transport the terminal will later use)

#### Locked error envelope (single shape, defined now)

All error responses use: `{"error": {"code": "<machine_code>", "message": "<human message>"}}`. This locks the `backend-api` contract's open "error-envelope" item for the whole service.

#### backend-api contract open-items this slice begins to satisfy
- "Endpoint definitions: router layout + path conventions" → locked: routes live in `app/api/` modules, registered in `app/main.py`; system routes under no prefix, future product routes under `/v1`.
- "Error envelope" → locked (above).
- Deferred (explicit): auth/session, WebSocket event *vocabulary* (terminal events), pagination, telemetry — these land with the slices that introduce real endpoints.

### Observability

| Type | Name | Where | Purpose |
|------|------|-------|---------|
| Structured log (baseline) | JSON log config | `app/logging_config.py` | One structured-logging setup for the whole service (stdout, JSON, level from env) |
| Structured log | `service.startup` | `app/main.py` lifespan | Record service start: version, db path presence (NOT the path value), bound port |
| Structured log | `health.db.error` | `app/api/system.py` | Record SQLite probe failures for the health route |

**OpenTelemetry tracing: ZERO in this slice — justified.** This slice creates no multi-hop runtime seam to trace (only a liveness probe + a WS echo). The cascade test (does this slice add a capability no traced runtime can see?) is **no**. The structured-logging *surface is established now* (so logging is never "added later"); OTel spans/metrics are declared by the first slice that adds real request flows.

Attribute rules (apply to all logs): allowed — `service`, `version`, `result`, `status`, `http.status_code`, `port`, `db_configured` (bool). Forbidden — absolute DB path, filesystem paths, secrets, tokens.

### Database Migrations

**Zero schema migrations in this slice.** The runtime creates/opens its own SQLite file (path from env) and confirms connectivity with `SELECT 1`. No domain tables, no SQLAlchemy, no Alembic — those land in the memory-substrate slice (ADR 0001 D5/invariant #6). The only DB action is open-or-create the file and a connectivity check.

### Edge Functions

None created or modified. (kai-chattr has no edge-function runtime; the backend is a persistent process, never edge — per the hosting posture.)

### Frontend Surface Area

**Zero frontend changes.** `apps/web` remains the placeholder; the OpenHands-stack frontend is a separate later slice. This slice is backend-only.

---

## Governance / Tooling Surface (required for deny-by-default)

This slice touches governance because the Python dep gate does not exist yet in kai-chattr.

1. **Port `check-python-deps.py`** from `blockdata/governance/scripts/check-python-deps.py` → `kai-chattr/governance/scripts/check-python-deps.py` (stdlib `tomllib`, PEP 621 + optional-deps + PEP 735 dependency-groups, ASCII-only output per the known cp1252 gotcha). Coordinate with the governance lane (another agent owns governance); this plan ports it as a precondition.
2. **Add the `services/api` key** to `governance/allowed-deps.json` with exactly the skeleton deps.
3. Both gates (`check-deps.mjs` for npm, `check-python-deps.py` for Python) must pass against the new `pyproject.toml`.

---

## Locked Acceptance Contract

The implementation is complete only when ALL are true:

1. From `services/api`, `uv run uvicorn app.main:app --port 8880` starts the service with `UV_PROJECT_ENVIRONMENT` pointing outside the checkout (no repo-local `.venv`).
2. `GET http://localhost:8880/health` returns `200` with `{"status":"ok","service":"kai-chattr-api","version":"0.0.0","db":"ok"}`.
3. A WebSocket client to `ws://localhost:8880/ws` receives `{"type":"hello"}` on connect and `{"echo":"ping"}` after sending `ping`.
4. The SQLite file is created at the env-configured path on first run, and `/health` reports `db:"ok"`.
5. `docker build` of `services/api/Dockerfile` succeeds and the container's `/health` returns `200`.
6. `node governance/scripts/check-deps.mjs` and `python governance/scripts/check-python-deps.py` both pass (exit 0) — the `services/api` deps are allowlisted and nothing un-allowlisted is present.
7. `uv run pytest` passes in `services/api` (health + ws tests green).
8. No legacy chattr logic exists under `services/api` (only the reserved empty packages).

## Locked Platform API Surface

- **New endpoints: `2`** — `GET /health`, `WS /ws`.
- Modified: `0`. Reused: `0`.

## Locked Inventory Counts

- New `services/api` source files: `9` (`pyproject.toml`, `app/__init__.py`, `app/main.py`, `app/settings.py`, `app/db.py`, `app/logging_config.py`, `app/api/__init__.py`, `app/api/system.py`, `app/api/ws.py`)
- Reserved empty packages: `5` (`app/core/__init__.py`, `app/sessions/__init__.py`, `app/agents/__init__.py`, `app/mcp/__init__.py`, `app/wrappers/__init__.py`)
- Container/dev files: `3` (`Dockerfile`, `.dockerignore`, `README.md`)
- Test files: `2` (`tests/test_health.py`, `tests/test_ws.py`) + `tests/__init__.py`
- Governance files: `1` new (`governance/scripts/check-python-deps.py`), `1` modified (`governance/allowed-deps.json`)
- Docs: `1` modified (`apps/devdocs/content/migration/repo-structure.mdx` — `src/` → `app/` correction)
- New deps allowlisted: `6` (`fastapi`, `uvicorn`, `pydantic-settings`, `ruff`, `pytest`, `httpx`)
- Database migrations: `0`. Frontend changes: `0`. Edge functions: `0`. OTel spans/metrics: `0`.

## Locked File Inventory

**New files**
- `services/api/pyproject.toml`
- `services/api/uv.lock` (generated)
- `services/api/app/__init__.py`
- `services/api/app/main.py`
- `services/api/app/settings.py`
- `services/api/app/db.py`
- `services/api/app/logging_config.py`
- `services/api/app/api/__init__.py`
- `services/api/app/api/system.py`
- `services/api/app/api/ws.py`
- `services/api/app/{core,sessions,agents,mcp,wrappers}/__init__.py` (reserved, empty)
- `services/api/tests/__init__.py`
- `services/api/tests/test_health.py`
- `services/api/tests/test_ws.py`
- `services/api/Dockerfile`
- `services/api/fly.toml` (reserved placeholder — Fly deploy surface; populated in the later deploy slice)
- `services/api/.dockerignore`
- `services/api/README.md`
- `governance/scripts/check-python-deps.py`

**Modified files**
- `governance/allowed-deps.json` (add `services/api` key)
- `apps/devdocs/content/migration/repo-structure.mdx` (`src/chattr_api/` → `app/`)

## Frozen Seam Contract

The frontend reaches this service **only** over typed HTTP + WebSocket. Do **not** add any code path that imports `app.*` from the frontend or assumes co-location. The service must start and pass `/health` with **no** frontend present. The SQLite path comes from env (`KAI_CHATTR_API_DB_PATH`), never hardcoded — this is what lets the same binary run local or in a cloud namespace.

## Explicit Risks Accepted In This Plan

1. **No auth/origin/session security in this slice.** `/health` and `/ws` are public on loopback. The localhost-security posture (session token, loopback-only registration, origin checks — carried from legacy chattr) lands with the FIRST real endpoint slice, before any sensitive route exists. Accepted because the skeleton exposes nothing sensitive.
2. **stdlib `sqlite3`, not SQLAlchemy.** Re-wiring to SQLAlchemy in the memory slice is accepted; the skeleton only proves the runtime owns a SQLite file.
3. **Porting `check-python-deps.py` touches the governance lane** (owned by another agent). Accepted as a precondition; coordinate before committing.

## Completion Criteria

Complete only when: the locked API surface exists exactly (2 endpoints); the inventory counts match the actual files; both dep gates pass; `uv run pytest` is green; `docker build` + container `/health` succeed; and no legacy chattr logic is present under `services/api`.

---

# Tasks

> Execution discipline: TDD where it applies, exact files, frequent commits. Read this plan fully before starting; stop and revise if a locked decision proves wrong. Conform to `repo-process` (uv, no repo-local `.venv`, external `UV_PROJECT_ENVIRONMENT`, secrets via SOPS).

## Task 1: Reserve the package structure

**File(s):** `services/api/app/__init__.py`, `services/api/app/api/__init__.py`, `services/api/app/{core,sessions,agents,mcp,wrappers}/__init__.py`, `services/api/tests/__init__.py`

**Step 1:** Create the directories and empty `__init__.py` files exactly as listed in the File Inventory (reserved packages stay empty with a one-line docstring `"""Reserved for the <name> slice."""`).
**Step 2:** Confirm `find services/api/app -name __init__.py` lists all 7 package inits.

**Commit:** `feat(api): reserve services/api package structure`

## Task 2: pyproject.toml + uv environment

**File(s):** `services/api/pyproject.toml`

**Step 1:** Author `pyproject.toml` mirroring the blockdata model:
```toml
[project]
name = "kai-chattr-api"
version = "0.0.0"
description = "kai-chattr platform API (FastAPI) — the relocatable agent runtime: typed-HTTP + WebSocket seam, owns its SQLite."
requires-python = ">=3.11"
# Only governance-allowlisted deps (governance/allowed-deps.json -> services/api).
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.32",
    "pydantic-settings>=2.0",
]

[dependency-groups]
dev = [
    "ruff>=0.6",
    "pytest>=8.0",
    "httpx>=0.27",
]

[tool.ruff]
line-length = 100
```
**Step 2:** From `services/api`, with `UV_PROJECT_ENVIRONMENT` set outside the checkout, run `uv sync` to generate `uv.lock`.
**Test command:** `uv run python -c "import fastapi, uvicorn, pydantic_settings; print('deps ok')"`
**Expected output:** `deps ok`
**Commit:** `feat(api): pyproject + uv env for services/api skeleton`

## Task 3: Allowlist the deps + port the Python gate

**File(s):** `governance/allowed-deps.json`, `governance/scripts/check-python-deps.py`

**Step 1:** Copy `blockdata/governance/scripts/check-python-deps.py` → `kai-chattr/governance/scripts/check-python-deps.py` verbatim (ASCII-only output; stdlib `tomllib`).
**Step 2:** Add to `governance/allowed-deps.json` a `services/api` key:
```json
"services/api": ["fastapi", "uvicorn", "pydantic-settings", "ruff", "pytest", "httpx"]
```
**Test command:** `python governance/scripts/check-python-deps.py`
**Expected output:** `OK: All declared Python dependencies are on the allowlist.` (exit 0)
**Commit:** `chore(governance): port python-deps gate + allowlist services/api skeleton deps`

## Task 4: Settings (env-based, container-clean)

**File(s):** `services/api/app/settings.py`

**Step 1:** Author pydantic-settings `Settings` (mirror blockdata's settings pattern):
```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="KAI_CHATTR_API_", env_file=None)
    service_name: str = "kai-chattr-api"
    version: str = "0.0.0"
    port: int = 8880
    db_path: str = "data/kai_chattr_api.sqlite3"
    log_level: str = "INFO"

settings = Settings()
```
**Step 2:** Confirm no hardcoded host/path outside env-overridable fields.
**Commit:** `feat(api): env-based settings`

## Task 5: SQLite ownership (stdlib)

**File(s):** `services/api/app/db.py`

**Step 1:** Author a minimal db module: ensure the parent dir of `settings.db_path` exists, open/create the SQLite file, and a `db_ok() -> bool` that runs `SELECT 1`.
```python
import os, sqlite3
from .settings import settings

def _connect() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(settings.db_path) or ".", exist_ok=True)
    return sqlite3.connect(settings.db_path)

def db_ok() -> bool:
    try:
        con = _connect()
        try:
            con.execute("SELECT 1")
            return True
        finally:
            con.close()
    except sqlite3.Error:
        return False
```
**Commit:** `feat(api): runtime owns its sqlite (stdlib, health ping)`

## Task 6: Logging baseline

**File(s):** `services/api/app/logging_config.py`

**Step 1:** Author a single JSON-ish structured logging setup (stdlib `logging`) reading level from `settings.log_level`, with a `get_logger(name)` helper. No PII; never log the db path value.
**Commit:** `feat(api): structured logging baseline`

## Task 7: /health route (TDD)

**File(s):** `services/api/tests/test_health.py`, `services/api/app/api/system.py`, `services/api/app/main.py`

**Step 1:** Write failing test `tests/test_health.py` using FastAPI `TestClient`: `GET /health` → 200 and JSON `{"status":"ok","service":"kai-chattr-api","version":"0.0.0","db":"ok"}`.
**Step 2:** Run it; confirm it fails (no app yet).
**Step 3:** Author `app/api/system.py` with an `APIRouter` exposing `GET /health` (uses `db_ok()`; returns the locked envelope; `503` + `{"error":{...}}` + `db:"error"` if not ok; logs `health.db.error` on failure).
**Step 4:** Author `app/main.py`: create `FastAPI(title=..., version=settings.version)`, a lifespan that logs `service.startup`, include the system router.
**Test command:** `uv run pytest tests/test_health.py`
**Expected output:** 1 passed.
**Commit:** `feat(api): /health endpoint with sqlite probe`

## Task 8: /ws WebSocket route (TDD)

**File(s):** `services/api/tests/test_ws.py`, `services/api/app/api/ws.py`, `services/api/app/main.py`

**Step 1:** Write failing test `tests/test_ws.py` with `TestClient.websocket_connect("/ws")`: expects first message `{"type":"hello"}`, then send `"ping"`, expect `{"echo":"ping"}`.
**Step 2:** Run it; confirm it fails.
**Step 3:** Author `app/api/ws.py`: a `@router.websocket("/ws")` that accepts, sends `{"type":"hello"}`, then loops receiving text and replying `{"echo": text}` as JSON.
**Step 4:** Register the ws router in `app/main.py`.
**Test command:** `uv run pytest`
**Expected output:** 2 passed (health + ws).
**Commit:** `feat(api): /ws websocket echo (seam established)`

## Task 9: Dockerfile + repo-structure doc correction

**File(s):** `services/api/Dockerfile`, `services/api/.dockerignore`, `services/api/README.md`, `apps/devdocs/content/migration/repo-structure.mdx`

**Step 1:** Author a minimal `uv`-based `Dockerfile` (python:3.12-slim, install uv, `uv sync --no-dev`, `CMD ["uv","run","uvicorn","app.main:app","--host","0.0.0.0","--port","8880"]`), a `.dockerignore` (`data/`, `__pycache__/`, `.venv/`, tests), and a `README.md` documenting `uv run uvicorn app.main:app --port 8880` and the env vars.
**Step 2:** Edit `repo-structure.mdx`: change the `services/api/src/chattr_api/...` tree to `services/api/app/...` to match the model repo (one-line tree correction + note).
**Test command:** `docker build -t kai-chattr-api services/api` then `docker run --rm -p 8880:8880 kai-chattr-api &` and `curl -s localhost:8880/health` (or PowerShell `Invoke-RestMethod`).
**Expected output:** container builds; `/health` returns `status: ok`.
**Commit:** `feat(api): containerize skeleton + fix repo-structure doc to app/ layout`

## Task 10: Full gate + acceptance pass

**Step 1:** From repo root: `node governance/scripts/check-deps.mjs` and `python governance/scripts/check-python-deps.py` — both exit 0.
**Step 2:** From `services/api`: `uv run ruff check .` and `uv run pytest` — clean + green.
**Step 3:** Start `uv run uvicorn app.main:app --port 8880`; verify `/health` (200) and a `/ws` round-trip (hello + echo).
**Step 4:** Confirm no legacy logic under `services/api` (reserved packages empty).
**Commit:** `chore(api): services/api skeleton — gates green, acceptance met`

---

## Plan Validity Gate (self-check)

1. **Requirement fit:** delivers the confirmed first scope — a containerizable, typed-HTTP+WS, SQLite-owning Python backend skeleton, no chattr logic. ✓
2. **Repo-reality fit:** `services/`/`packages/` empty (verified); model = `blockdata/services/api` `app/` layout (verified); `allowed-deps.json` empty + no `check-python-deps.py` (verified → ported in Task 3); ports table assigns api `8880`. ✓
3. **Strongest plan:** mirrors the proven model repo rather than inventing; stdlib SQLite avoids premature ORM (ADR-aligned); `app/` over `src/` chosen to match the model (rejected `src/` from the earlier sketch, corrected in Task 9). ✓
4. **Contract completeness:** manifest (API/observability/DB/edge/frontend), higher-rigor locks, inventories, risks, completion — all present or explicit-zero. ✓
5. **Handoff readiness:** governance-lane coupling (Task 3) flagged; no hidden scope. ✓
