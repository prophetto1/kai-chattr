# Kai Chattr Architecture Runtime Parity Implementation Plan

**Goal:** Bring `E:\kai-chattr` close to `E:\writing-system` in operating stack and runtime architecture by making the repo start, verify, and guard its own `apps/web` frontend and `services/api` backend without any legacy `E:\chattr` runtime dependency.

**Architecture:** `apps/web` remains the React/Vite workbench frontend. `services/api` remains the standalone FastAPI API/WebSocket/MCP backend. Root-level scripts own local startup, probe, contract checks, and browser acceptance. The runtime contract is `8800` for Vite, `8840` for API/WebSocket, `8841` for MCP streamable HTTP, and `8842` for MCP SSE. `E:\writing-system` is the operating-shape reference only. `E:\chattr` is the functional source reference only.

**Tech Stack:** pnpm 10, Node test runner, Vite 7, React 19, TypeScript, FastAPI, Uvicorn, uv, pytest, OpenTelemetry-compatible runtime logs, MCP Python SDK, Playwright for browser acceptance, shadcn/ui source components, Vercel AI Elements / AI SDK React source components. Supabase is explicitly excluded from kai-chattr.

**Status:** Complete
**Author:** Codex for Jon
**Date:** 2026-06-07

## Manifest

### Objective

The objective is architecture/runtime parity, not product-feature parity.

This plan is successful only when kai-chattr has the same operating discipline as writing-system:

1. One root command starts the local frontend and backend with one shared session-token contract.
2. The browser workbench is verified through `http://127.0.0.1:8800/workbench`.
3. API, WebSocket, MCP, and Board capability probes hit kai-chattr runtime on `8840/8841/8842`.
4. No code path proxies to, imports from, shells into, or depends on `E:\chattr` at runtime.
5. No React source or built workbench output lives under `services/api`.
6. No `/api/session` endpoint exposes a raw browser session token.
7. Root tests guard the port map, runtime startup contract, legacy-port drift, and browser acceptance path.
8. `services/api` is structured as an owned backend service, not a pile of legacy runtime code hidden behind a web proxy.

### Explicit Non-Goals

1. No devdocs/Fumadocs work in kai-chattr in this phase.
2. No product-feature parity with writing-system.
3. No visual/design parity with writing-system.
4. No Board behavior implementation in this plan beyond runtime probes proving the Board backend surface is reachable through `8800`.
5. No Docker-only backend requirement in this phase. Unlike writing-system's `platform-api`, kai-chattr launches local CLI agents and terminal sessions, so host-process API startup remains valid unless a later plan proves containerization can preserve those launcher requirements.
6. No copied files from `E:\writing-system`.
7. No copied static UI from `E:\chattr`.
8. No Supabase parity. Do not add Supabase Auth, Supabase Storage, Supabase Edge Functions, Supabase local-stack scripts, Supabase migrations, Supabase CLI usage, Supabase environment variables, Supabase secrets, or Supabase-generated clients to kai-chattr.

## Current-State Findings

### Files Inspected

#### Kai-chattr

- `AGENTS.md`
- `package.json`
- `pnpm-workspace.yaml`
- `governance/contracts/architecture.json`
- `governance/contracts/frontend.json`
- `apps/web/package.json`
- `apps/web/vite.config.ts`
- `apps/web/src/main.tsx`
- `apps/web/src/lib/chattr-api.ts`
- `apps/web/src/routes/workbench.tsx`
- `services/api/pyproject.toml`
- `services/api/config.toml`
- `services/api/app/cli.py`
- `services/api/app/main.py`
- `services/api/app/security.py`
- `services/api/app/websocket.py`
- `services/api/app/routes/status.py`
- `services/api/app/routes/static_frontend.py`
- `services/api/tests/test_runtime_health.py`
- `docs/plans/kai-chattr-workbench-board-runtime-recovery-implementation-plan.md`

#### Writing-system Reference

- `E:\writing-system\__start-here\README.md`
- `E:\writing-system\package.json`
- `E:\writing-system\pnpm-workspace.yaml`
- `E:\writing-system\web\package.json`
- `E:\writing-system\web\vite.config.ts`
- `E:\writing-system\services\platform-api\pyproject.toml`
- `E:\writing-system\services\platform-api\app\main.py`
- `E:\writing-system\scripts\probe-platform-api-reachable.mjs`
- `E:\writing-system\scripts\lib\writing-system-dev-ports.mjs`
- `E:\writing-system\scripts\tests\local-dev-port-drift-contract.test.mjs`
- `E:\writing-system\scripts\tests\jon-local-runtime-contract.test.mjs`
- `E:\writing-system\scripts\tests\no-host-platform-api-venv-contract.test.mjs`
- `E:\writing-system\scripts\tests\platform-api-container-contract.test.mjs`

### Verified Current Shape

1. `package.json` in kai-chattr only exposes `web:*` and governance checks. It does not expose a root `dev`, runtime probe, local verification, or API test command.
2. `apps/web/package.json` starts Vite on `127.0.0.1:8800`.
3. `apps/web/vite.config.ts` proxies `/api`, `/uploads`, and `/ws` to `http://127.0.0.1:8840`.
4. `apps/web/src/lib/chattr-api.ts` can send `X-Session-Token` from query, window globals, or `VITE_KAI_CHATTR_SESSION_TOKEN`.
5. `services/api/config.toml` declares the intended local ports: frontend `8800`, API `8840`, MCP HTTP `8841`, MCP SSE `8842`, and comments that legacy `8300/8301/8302` are reference-only.
6. `services/api/app/cli.py` starts API/WebSocket plus MCP servers and generates an in-memory token when env does not provide one.
7. `services/api/app/main.py` still owns app construction, security middleware, route registration, WebSocket logic, runtime endpoints, and large amounts of migrated behavior in one module.
8. `services/api/app/security.py` is only a placeholder comment.
9. `services/api/app/routes/static_frontend.py` is only a placeholder comment. API tests already assert `/workbench` and `/static/app.js` return `404` from `8840`.
10. There is no `scripts/` directory in kai-chattr.
11. There is no `runtime/` directory in kai-chattr.
12. There is no `services/api/Dockerfile` in the current worktree.
13. Writing-system's useful reference pattern is not its product code. It is root orchestration, port registry, preflight probe, local runtime contract tests, and backend ownership boundaries.
14. Writing-system's Supabase local stack is not part of the kai-chattr parity target.

## Proposed Architecture

### Runtime Topology

```text
pnpm run dev
  -> scripts/dev/start-kai-chattr.mjs
       -> generates one local dev session token in process memory
       -> starts services/api on 127.0.0.1:8840 with KAI_CHATTR_SESSION_TOKEN
       -> starts apps/web Vite on 127.0.0.1:8800 with VITE_KAI_CHATTR_SESSION_TOKEN
       -> never prints the raw token

browser
  -> http://127.0.0.1:8800/workbench
  -> Vite proxy /api and /ws
  -> http://127.0.0.1:8840
  -> services/api app
  -> local stores, WS hub, MCP bridge, launcher wrappers

MCP clients
  -> http://127.0.0.1:8841/mcp
  -> http://127.0.0.1:8842/sse
  -> services/api owned MCP bridge
```

### Intentional Divergence From Writing-System

Writing-system runs `services/platform-api` as a Docker-only backend because it is a data/product platform API. Kai-chattr's backend launches local CLI agents and terminal sessions. This plan keeps `services/api` as a host process for now and borrows the operating controls instead:

- canonical port registry
- root startup entrypoints
- preflight probes
- contract tests
- no legacy runtime drift
- owned backend app structure

Writing-system also uses Supabase for Auth, local DB/runtime, storage, and migration control. Kai-chattr must not inherit that part of the stack. Kai-chattr persistence remains backend-owned through its current stores/runtime data in this phase. If a future data plan needs durable database storage, it must specify a direct backend-owned persistence path and still exclude Supabase unless Jon explicitly changes this decision.

If a future plan attempts Docker-only kai-chattr API startup, it must first prove agent launcher, terminal, MCP proxy, and host CLI behavior still work.

## Pre-Implementation Contract

No major product, API, observability, or inventory decision may be improvised during implementation. If any item below needs to change, implementation must stop and this plan must be revised first.

## Locked Product Decisions

1. `apps/web` is the only home for React source and Vite build output.
2. `services/api` is the only home for API, WebSocket, MCP, stores, launcher, and backend runtime code.
3. `services/api` must not serve `/workbench` or `/static` frontend assets.
4. `E:\chattr` is source reference only. No runtime dependency on it is allowed.
5. `E:\writing-system` is operating-shape reference only. No copied product files and no runtime dependency on it are allowed.
6. Local dev uses the `8800/8840/8841/8842` port map.
7. `/api/session` must not be restored.
8. The browser workbench must receive the session token through the local dev process environment or a same-process window bootstrap, not through an unauthenticated REST endpoint.
9. The architecture parity plan must complete before the Board feature parity plan is executed.
10. Supabase is not part of kai-chattr architecture parity. Writing-system parity means the operating controls around frontend/backend/runtime verification, not Supabase Auth, Storage, local stack, migrations, or secrets.

## Platform API

### Existing Endpoints Consumed

| Verb | Path | Use | Contract |
|------|------|-----|----------|
| GET | `/api/runtime/ports` | Runtime probe and browser acceptance | Public runtime metadata only. No session token required. |
| GET | `/api/status` | API readiness probe | Must be reachable through `8840` and Vite proxy on `8800`. |
| GET | `/api/right-rail/capabilities` | Board surface smoke probe | Requires `X-Session-Token`; returns the right-rail tab/capability shape. |
| GET | `/openapi.json` | API registration verification | Requires token where middleware applies. |
| WS | `/ws` | Browser live runtime path | Requires session token on connect. |

### New Endpoints

No new product endpoints.

### Modified Endpoint Contracts

No endpoint path or response-shape changes are planned in this architecture-runtime phase.

Internal implementation changes are allowed only to preserve the existing endpoint contracts while moving ownership out of `app.main`.

### Forbidden Endpoint

`GET /api/session` is forbidden. It must not be implemented, restored, or used by the browser.

## Observability

### New Runtime Events

| Type | Name | Where | Purpose |
|------|------|-------|---------|
| Structured log | `kai_chattr.runtime.dev_start` | `scripts/dev/start-kai-chattr.mjs` | Record local startup of web/API/MCP without token disclosure. |
| Structured log | `kai_chattr.runtime.probe` | `scripts/probe-kai-chattr-runtime.mjs` | Record probe target, result, and latency. |
| Structured log | `kai_chattr.api.startup` | `services/api/app/cli.py` or `services/api/app/lifecycle.py` | Record API/MCP startup ports and token source type only. |
| Structured log | `kai_chattr.security.denied` | `services/api/app/security.py` | Record denied API/WS requests without token value. |

### Attribute Rules

Allowed attributes:

- `component`
- `host`
- `port`
- `path`
- `status`
- `http.status_code`
- `duration_ms`
- `token_source`
- `has_token`

Forbidden attributes:

- raw session token
- API keys
- SOPS secret values
- full command-line arguments containing secrets
- user-entered chat content
- raw message text

## Database Migrations

No database migrations.

Kai-chattr's current runtime state is file/store backed under `services/api` runtime data. This phase does not add Postgres tables and does not add any Supabase tables, migrations, buckets, Auth configuration, local stack, or CLI workflow.

## Edge Functions

No edge functions.

## Frontend Surface Area

### New Frontend Files

No new React routes or components are required for architecture-runtime parity.

### Modified Frontend Files

| File | Change |
|------|--------|
| `apps/web/src/lib/chattr-api.ts` | Remove query-string token fallback and rely on process-provided `VITE_KAI_CHATTR_SESSION_TOKEN` or same-process window bootstrap. |
| `apps/web/vite.config.ts` | Keep proxy target on `8840`; add explicit comments or small guard only if needed by the runtime contract tests. |
| `apps/web/package.json` | Add Playwright/browser acceptance script only if the root script delegates into the web package. |

### Explicit Frontend Zero-Cases

1. No new page.
2. No new dock component.
3. No Board UI redesign in this phase.
4. No shadcn/Vercel component additions in this phase unless Playwright or test utilities require package metadata changes.

## Backend Surface Area

### New Backend Files

| File | Purpose |
|------|---------|
| `services/api/app/factory.py` | Own `create_app()` and route inclusion so `app.main` stops being the construction authority. |
| `services/api/app/runtime_contract.py` | Own runtime port/session-token contract helpers used by CLI, tests, and health probes. |
| `services/api/tests/test_runtime_contract.py` | Verify app factory, forbidden frontend serving, forbidden `/api/session`, and runtime ports. |

### Modified Backend Files

| File | Change |
|------|--------|
| `services/api/app/main.py` | Preserve behavior but delegate app creation, route registration, security installation, and runtime contract helpers out to owned modules. |
| `services/api/app/cli.py` | Start through runtime contract helpers; set token source; log ports without printing token. |
| `services/api/app/security.py` | Replace placeholder with real middleware/token/origin helpers currently embedded in `main.py`. |
| `services/api/app/lifecycle.py` | Own startup/shutdown hooks that are currently registered inside CLI or module-level code. |
| `services/api/app/routes/status.py` | Keep `/api/runtime/ports` and `/api/status`; ensure contracts are stable. |
| `services/api/app/routes/static_frontend.py` | Delete this placeholder or remove it from route registration because API must not own frontend serving. |
| `services/api/tests/conftest.py` | Provide reusable configured app/client fixtures for runtime contract tests. |
| `services/api/tests/test_runtime_health.py` | Keep existing assertions and add any missing `/api/session` negative case. |

## Repo/Runtime Tooling Surface

### New Files

| File | Purpose |
|------|---------|
| `scripts/lib/kai-chattr-dev-ports.mjs` | Canonical port registry for `8800/8840/8841/8842` and forbidden legacy ports. |
| `scripts/dev/start-kai-chattr.mjs` | One-command local dev orchestrator for API, MCP, and Vite with shared in-memory session token. |
| `scripts/probe-kai-chattr-runtime.mjs` | Probe `8800` and `8840` runtime paths before browser acceptance. |
| `scripts/tests/kai-chattr-runtime-contract.test.mjs` | Node contract test for root scripts, port registry, and required runtime files. |
| `scripts/tests/kai-chattr-port-drift-contract.test.mjs` | Scan repo runtime files for active `8300/8301/8302` drift. |
| `scripts/tests/kai-chattr-no-api-session-contract.test.mjs` | Assert `/api/session` is not registered or referenced as a browser token source. |
| `scripts/tests/kai-chattr-no-supabase-contract.test.mjs` | Assert kai-chattr runtime parity does not import writing-system Supabase stack assumptions. |
| `playwright.config.ts` | Browser acceptance configuration for `127.0.0.1:8800`. |
| `tests/e2e/workbench-runtime.spec.ts` | Browser acceptance: load `/workbench`, verify no Board API error, verify proxied API. |

### Modified Files

| File | Change |
|------|--------|
| `package.json` | Add root `dev`, `runtime:probe`, `test:runtime-contract`, `test:port-drift-contract`, `test:no-api-session-contract`, `test:no-supabase-contract`, `test:workbench-browser`, and `verify-local` scripts. |
| `pnpm-lock.yaml` | Update only if adding `@playwright/test` or other test dependency. |
| `governance/contracts/architecture.json` | Add any new approved tooling dependency, such as `@playwright/test`, one slice at a time. |

## Locked API/Runtime Surface

### Runtime Ports

| Service | Host | Port | Owner |
|---------|------|------|-------|
| Web/Vite | `127.0.0.1` | `8800` | `apps/web` |
| API/WebSocket | `127.0.0.1` | `8840` | `services/api` |
| MCP streamable HTTP | `127.0.0.1` | `8841` | `services/api/app/mcp/bridge.py` |
| MCP SSE | `127.0.0.1` | `8842` | `services/api/app/mcp/bridge.py` |

### Forbidden Runtime Ports

`8300`, `8301`, and `8302` are forbidden as active kai-chattr runtime targets. They may appear only in explicit reference-only comments or tests that assert they are not active.

### Session Token Contract

1. `scripts/dev/start-kai-chattr.mjs` generates one token per local dev process unless `KAI_CHATTR_SESSION_TOKEN` is already set by the environment.
2. The same token is passed to `services/api` as `KAI_CHATTR_SESSION_TOKEN`.
3. The same token is passed to Vite as `VITE_KAI_CHATTR_SESSION_TOKEN`.
4. The token is never written to a repo file.
5. The token is never printed raw.
6. `/api/session` remains absent.

## Locked Acceptance Contract

The implementation is complete only when all of the following are true:

1. `pnpm run dev` starts API/WebSocket/MCP and Vite using the locked port map.
2. `pnpm run runtime:probe` verifies `http://127.0.0.1:8800/workbench`, `http://127.0.0.1:8800/api/runtime/ports`, `http://127.0.0.1:8840/api/runtime/ports`, and authenticated `http://127.0.0.1:8800/api/right-rail/capabilities`.
3. Unauthenticated `GET /api/right-rail/capabilities` through `8800` or `8840` returns `403`.
4. `GET http://127.0.0.1:8840/workbench` returns `404`.
5. `GET http://127.0.0.1:8840/static/app.js` returns `404`.
6. `GET /api/session` returns `404` and no frontend code fetches it.
7. Playwright opens `http://127.0.0.1:8800/workbench` and the Board tab does not show "Board API error" from missing session bootstrap.
8. `rg`-based drift tests find no active `8300/8301/8302` runtime dependency.
9. Supabase drift tests find no active Supabase Auth, Storage, local-stack, migration, CLI, secret, or environment-variable dependency.
10. Backend tests pass from `services/api`.
11. Web build passes from `apps/web`.
12. Governance dependency checks pass.

## Locked Inventory Counts

### Migrated Files

- Files copied from `E:\writing-system`: `0`
- Files copied from `E:\chattr`: `0`

### New Files

- Runtime/browser tooling files: `9`
- Backend files: `3`
- Total new implementation files: `12`
- Plan document files: `1`

### Modified Files

- Root/package/governance files: `3`
- Frontend files: `3`
- Backend files: `7`
- Total modified implementation files: `13`

### Deleted Files

- `services/api/app/routes/static_frontend.py`: `1`, if route registration confirms no import requires the placeholder.

If implementation changes these counts, stop and revise this plan before continuing.

## Locked File Inventory

### New Files

1. `scripts/lib/kai-chattr-dev-ports.mjs`
2. `scripts/dev/start-kai-chattr.mjs`
3. `scripts/probe-kai-chattr-runtime.mjs`
4. `scripts/tests/kai-chattr-runtime-contract.test.mjs`
5. `scripts/tests/kai-chattr-port-drift-contract.test.mjs`
6. `scripts/tests/kai-chattr-no-api-session-contract.test.mjs`
7. `scripts/tests/kai-chattr-no-supabase-contract.test.mjs`
8. `playwright.config.ts`
9. `tests/e2e/workbench-runtime.spec.ts`
10. `services/api/app/factory.py`
11. `services/api/app/runtime_contract.py`
12. `services/api/tests/test_runtime_contract.py`
13. `docs/plans/kai-chattr-architecture-runtime-parity-implementation-plan.md`

Implementation file count excludes this plan document. Including the plan document, the full file inventory contains `13` new files.

### Modified Files

1. `package.json`
2. `pnpm-lock.yaml`
3. `governance/contracts/architecture.json`
4. `apps/web/package.json`
5. `apps/web/vite.config.ts`
6. `apps/web/src/lib/chattr-api.ts`
7. `services/api/app/main.py`
8. `services/api/app/cli.py`
9. `services/api/app/security.py`
10. `services/api/app/lifecycle.py`
11. `services/api/app/routes/status.py`
12. `services/api/tests/conftest.py`
13. `services/api/tests/test_runtime_health.py`

### Deleted Files

1. `services/api/app/routes/static_frontend.py`, only after verifying route registration no longer imports it.

## Frozen Runtime Boundary Contract

The architecture boundary is:

- Browser UI: `apps/web`
- Runtime API: `services/api`
- Runtime state: `services/api` stores and runtime data
- MCP bridge/tools: `services/api/app/mcp`
- Agent wrappers/launchers: `services/api/app/wrappers` and `services/api/app/launch`
- Legacy behavior reference: `E:\chattr`
- Operating-shape reference: `E:\writing-system`

Do not solve architecture parity by:

1. Recreating `services/api/static`.
2. Serving React from FastAPI.
3. Proxying kai-chattr to `E:\chattr`.
4. Depending on ports `8300/8301/8302`.
5. Restoring `/api/session`.
6. Moving Board feature work ahead of runtime verification.
7. Importing writing-system's Supabase stack into kai-chattr.

## Explicit Risks Accepted In This Plan

1. The plan keeps kai-chattr API as a host process because local CLI/terminal control is part of kai-chattr's backend responsibility.
2. Passing `VITE_KAI_CHATTR_SESSION_TOKEN` to Vite exposes the local dev token to the local browser runtime. This is acceptable only for loopback local dev and only because `/api/session` remains forbidden and no token is written to disk.
3. `services/api/app/main.py` is large. This plan requires staged extraction with tests rather than a full rewrite.
4. Board feature parity is deliberately deferred until the browser/API runtime path is trustworthy.
5. Writing-system's Supabase-backed local stack is intentionally not adopted. Kai-chattr may need a future direct persistence plan, but that plan must not assume Supabase.

## Tasks

### Task 1: Add Canonical Port Registry

**Files:** `scripts/lib/kai-chattr-dev-ports.mjs`

**Step 1:** Create the `scripts/lib` directory.
**Step 2:** Add `KAI_CHATTR_PORTS` with `web: 8800`, `api: 8840`, `mcpHttp: 8841`, and `mcpSse: 8842`.
**Step 3:** Add `FORBIDDEN_LEGACY_PORTS = [8300, 8301, 8302]`.
**Step 4:** Export helpers for `localWebUrl()`, `localApiUrl()`, `localMcpHttpUrl()`, and `localMcpSseUrl()`.

**Test command:** `node --test scripts/tests/kai-chattr-runtime-contract.test.mjs`

**Expected output:** Runtime contract test passes and confirms the canonical ports.

**Commit:** `chore: add kai-chattr runtime port registry`

### Task 2: Add Runtime Contract Tests

**Files:**

- `scripts/tests/kai-chattr-runtime-contract.test.mjs`
- `scripts/tests/kai-chattr-port-drift-contract.test.mjs`
- `scripts/tests/kai-chattr-no-api-session-contract.test.mjs`
- `scripts/tests/kai-chattr-no-supabase-contract.test.mjs`

**Step 1:** Add a runtime contract test that asserts root `package.json` has the required scripts after Task 3.
**Step 2:** Add a port drift test that scans `package.json`, `apps/web`, `services/api/app`, `services/api/tests`, and `scripts` for active `8300/8301/8302` references.
**Step 3:** Allow only explicit reference-only comments or the drift test itself to mention `8300/8301/8302`.
**Step 4:** Add a no-api-session test that scans frontend/backend source for `GET /api/session`, `fetch('/api/session')`, and route registration for `/api/session`.
**Step 5:** Add a no-supabase test that scans runtime and config surfaces for Supabase imports, env vars, local-stack commands, migrations, and secrets.

**Test command:** `node --test scripts/tests/kai-chattr-runtime-contract.test.mjs scripts/tests/kai-chattr-port-drift-contract.test.mjs scripts/tests/kai-chattr-no-api-session-contract.test.mjs scripts/tests/kai-chattr-no-supabase-contract.test.mjs`

**Expected output:** Tests fail before scripts are added where appropriate, then pass after Tasks 3 and 4.

**Commit:** `test: guard kai-chattr runtime contract`

### Task 3: Add One-Command Runtime Startup

**Files:**

- `scripts/dev/start-kai-chattr.mjs`
- `package.json`

**Step 1:** Create `scripts/dev/start-kai-chattr.mjs`.
**Step 2:** Generate a token with Node `crypto.randomBytes(32).toString('hex')` if `KAI_CHATTR_SESSION_TOKEN` is absent.
**Step 3:** Spawn `uv run python -m app.cli` from `services/api` with `KAI_CHATTR_SESSION_TOKEN`.
**Step 4:** Spawn `pnpm --dir apps/web run dev` with `VITE_KAI_CHATTR_SESSION_TOKEN`.
**Step 5:** Forward child process output, but redact any token-like value if a child prints one.
**Step 6:** On Ctrl+C or child exit, stop both children.
**Step 7:** Add root script `"dev": "node scripts/dev/start-kai-chattr.mjs"`.

**Test command:** `pnpm run dev`

**Expected output:** API prints `8840/8841/8842`, Vite prints `8800`, and no raw token is printed.

**Commit:** `feat: add kai-chattr local runtime orchestrator`

### Task 4: Add Runtime Probe

**Files:**

- `scripts/probe-kai-chattr-runtime.mjs`
- `package.json`

**Step 1:** Probe `http://127.0.0.1:8840/api/runtime/ports`.
**Step 2:** Probe `http://127.0.0.1:8800/api/runtime/ports`.
**Step 3:** Probe `http://127.0.0.1:8800/workbench`.
**Step 4:** Probe unauthenticated `http://127.0.0.1:8800/api/right-rail/capabilities` and expect `403`.
**Step 5:** Probe authenticated `http://127.0.0.1:8800/api/right-rail/capabilities` with `X-Session-Token` from `KAI_CHATTR_SESSION_TOKEN` and expect Board tabs/capabilities.
**Step 6:** Probe `http://127.0.0.1:8840/workbench` and expect `404`.
**Step 7:** Add root script `"runtime:probe": "node scripts/probe-kai-chattr-runtime.mjs"`.

**Test command:** `pnpm run runtime:probe`

**Expected output:** Probe prints each checked URL and exits `0`.

**Commit:** `test: add kai-chattr runtime probe`

### Task 5: Remove URL Token Fallback

**Files:** `apps/web/src/lib/chattr-api.ts`

**Step 1:** Remove `new URLSearchParams(window.location.search).get('token')`.
**Step 2:** Keep `window.__SESSION_TOKEN__`, `window.__CHATTR_SESSION_TOKEN__`, `window.__CHATTR_SESSION__?.token`, and `VITE_KAI_CHATTR_SESSION_TOKEN`.
**Step 3:** Add or update frontend tests if a test harness exists during implementation.

**Test command:** `pnpm --dir apps/web run build`

**Expected output:** Vite build exits `0`.

**Commit:** `fix: remove query token fallback from workbench API client`

### Task 6: Extract Backend App Factory And Security

**Files:**

- `services/api/app/factory.py`
- `services/api/app/security.py`
- `services/api/app/lifecycle.py`
- `services/api/app/main.py`
- `services/api/tests/test_runtime_contract.py`

**Step 1:** Add tests proving the existing app still registers `/api/runtime/ports`, `/api/status`, `/ws`, and right-rail routes.
**Step 2:** Move security middleware helper code from `main.py` into `security.py`.
**Step 3:** Move app construction and route inclusion into `factory.py`.
**Step 4:** Move startup/shutdown registration into `lifecycle.py`.
**Step 5:** Keep `app.main.app` import compatibility during the extraction so existing tests continue to work.
**Step 6:** Verify `/api/session` remains absent.
**Step 7:** Verify `/workbench` and `/static/app.js` remain `404` from `8840`.

**Test command:** `cd services/api; uv run pytest -q tests/test_runtime_health.py tests/test_runtime_contract.py`

**Expected output:** Tests exit `0`.

**Commit:** `refactor(api): extract runtime app factory and security`

### Task 7: Delete Static Frontend Placeholder

**Files:**

- `services/api/app/routes/static_frontend.py`
- `services/api/app/main.py`
- `services/api/tests/test_runtime_contract.py`

**Step 1:** Verify route registration imports `static_frontend.py`.
**Step 2:** Remove `static_frontend.py` from the route module list.
**Step 3:** Delete `services/api/app/routes/static_frontend.py`.
**Step 4:** Keep negative tests for `/workbench` and `/static/app.js`.

**Test command:** `cd services/api; uv run pytest -q tests/test_runtime_health.py tests/test_runtime_contract.py`

**Expected output:** Tests exit `0`; frontend routes remain unserved by API.

**Commit:** `refactor(api): remove static frontend route placeholder`

### Task 8: Add Playwright Browser Acceptance

**Files:**

- `playwright.config.ts`
- `tests/e2e/workbench-runtime.spec.ts`
- `package.json`
- `pnpm-lock.yaml`
- `governance/contracts/architecture.json`

**Step 1:** Add `@playwright/test` as a root dev dependency only after updating the architecture dependency allowlist.
**Step 2:** Configure Playwright base URL `http://127.0.0.1:8800`.
**Step 3:** Write a test that opens `/workbench`.
**Step 4:** Assert no visible text `Board API error`.
**Step 5:** Assert the proxied runtime ports endpoint responds through `8800`.
**Step 6:** Add root script `"test:workbench-browser": "playwright test tests/e2e/workbench-runtime.spec.ts"`.

**Test command:** `pnpm run test:workbench-browser`

**Expected output:** Playwright test exits `0` against the running kai-chattr local runtime.

**Commit:** `test: add workbench browser runtime acceptance`

### Task 9: Add Verification Aggregates

**Files:** `package.json`

**Step 1:** Add `"test:runtime-contract"`.
**Step 2:** Add `"test:port-drift-contract"`.
**Step 3:** Add `"test:no-api-session-contract"`.
**Step 4:** Add `"test:no-supabase-contract"`.
**Step 5:** Add `"verify-local"` to run governance checks, Node contract tests, API pytest, web build, runtime probe, and Playwright browser acceptance.

**Test command:** `pnpm run verify-local`

**Expected output:** All checks exit `0`.

**Commit:** `chore: add kai-chattr local verification aggregate`

## Verification Commands

Run these before claiming this implementation complete:

```powershell
pnpm run check:contracts
pnpm run check:deps
pnpm run test:runtime-contract
pnpm run test:port-drift-contract
pnpm run test:no-api-session-contract
pnpm run test:no-supabase-contract
cd services/api; uv run python -m compileall app -q
cd services/api; uv run pytest -q
pnpm --dir apps/web run build
pnpm run dev
pnpm run runtime:probe
pnpm run test:workbench-browser
```

`pnpm run dev` must remain running for `runtime:probe` and `test:workbench-browser`.

## Completion Criteria

The work is complete only when:

1. The locked file inventory matches the implementation or this plan has been explicitly revised.
2. The root runtime scripts exist and are used.
3. The browser workbench opens through `8800`.
4. The API runtime ports endpoint works through both `8840` and the `8800` proxy.
5. Authenticated Board capability probing works through `8800`.
6. Unauthenticated Board capability probing returns `403`.
7. `/api/session` is absent.
8. `services/api` does not serve frontend routes or static frontend assets.
9. Active `8300/8301/8302` runtime references are absent.
10. Active Supabase runtime references are absent.
11. API pytest passes.
12. Web build passes.
13. Playwright browser acceptance passes.

## Handoff Rule

An implementer must read this plan fully before starting. If a locked decision is wrong, stop and revise the plan before editing runtime code. Do not silently substitute a proxy, a mock, a skip flag, or a legacy repo dependency.
