# Kai-chattr writing-system parity without Supabase

Status: investigation note
Date: 2026-06-07
Scope: `E:\kai-chattr` operating parity with `E:\writing-system`, with every Supabase role replaced or excluded.

## Answer

Kai-chattr can match the operating shape of `E:\writing-system` without adopting Supabase, but the current repo is only partway there.

Current kai-chattr already has the right broad application split:

- `apps/web`: Vite/React workbench.
- `services/api`: Python FastAPI backend with MCP, WebSocket, launcher, runtime events, SQLAlchemy, SQLAdmin, Alembic, and uv.
- `governance/`: dependency allowlist and contracts.

It does not yet have the full writing-system operating shape:

- no root `dev` orchestration command,
- no `WORKER-ACCESS.md`,
- no `apps/devdocs` Fumadocs app in the current tree,
- no `services/api/Dockerfile`,
- no local stack scripts,
- no local Postgres/Neon data-plane contract,
- no MinIO/R2 storage parity contract,
- no Better Auth service,
- no writing-system-style health/data-plane probe set.

No Supabase references were found in the inspected kai-chattr app, service, or governance files. That part is already aligned.

## Current evidence

Files inspected:

- `AGENTS.md`
- `README.md`
- `package.json`
- `apps/web/package.json`
- `apps/web/vite.config.ts`
- `services/api/pyproject.toml`
- `services/api/config.toml`
- `services/api/app/cli.py`
- `governance/contracts/architecture.json`
- `governance/contracts/backend.json`
- `governance/contracts/frontend.json`
- `docs/plans/kai-chattr-architecture-runtime-parity-implementation-plan.md`

Findings:

- Root scripts currently expose `web:dev`, `web:build`, `web:preview`, `check:contracts`, and `check:deps`.
- `apps/web` runs Vite on `127.0.0.1:8800`.
- `apps/web/vite.config.ts` proxies `/api`, `/uploads`, and `/ws` to `127.0.0.1:8840`.
- `services/api/config.toml` declares API/WebSocket `8840`, MCP HTTP `8841`, and MCP SSE `8842`.
- `services/api` already declares FastAPI, Uvicorn, SQLAlchemy, SQLAdmin, Alembic, psycopg2, pydantic-settings, Ruff, and pytest.
- `governance/contracts/architecture.json` says `apps/web` deploys a Vite static build to Cloudflare Pages.
- `governance/contracts/backend.json` has no locked backend rules yet.
- `WORKER-ACCESS.md` is referenced by `AGENTS.md` but is absent in the current tree.
- The existing runtime parity plan deliberately excludes Fumadocs and Docker-only API startup in its current phase. Under this stricter requirement, those exclusions must be amended or explicitly re-ratified as kai-chattr-specific exceptions.

## Target shape

The target is not to copy writing-system code. The target is to match its operating roles:

```text
root command
  -> starts/verifies docs, web, backend, and local runtime dependencies

browser
  -> Vite web
  -> Vite proxy
  -> FastAPI API/WebSocket/MCP backend

backend
  -> local persistence
  -> local object storage
  -> local auth/session issuer when product auth exists
  -> no legacy E:\chattr runtime dependency
  -> no Supabase
```

## Supabase replacement map

| Writing-system role | Kai-chattr no-Supabase equivalent |
|---|---|
| Supabase Auth | Better Auth service if product user auth is needed. If kai-chattr remains local operator-only, keep the session-token control model and document it as a local runtime control, not product auth. |
| Supabase Postgres | Plain local Postgres container for local dev; Neon for hosted dev/prod if persistent hosted state is required. |
| Supabase migrations | Alembic owned by `services/api`. No Supabase CLI and no Supabase migration files. |
| Supabase Storage | MinIO locally and Cloudflare R2 in hosted environments, using one S3-compatible storage contract. |
| Supabase local stack scripts | `local:postgres:*`, `local:minio:*`, `local:api:*`, and probe scripts owned by kai-chattr. |
| Supabase env vars/secrets | SOPS files with kai-chattr names only. No `SUPABASE_*` variables. |
| Supabase generated/browser clients | None. Browser talks to kai-chattr API and auth client only. |

## Required changes

1. Lock the no-Supabase topology in governance.

   Add backend and architecture rules stating that Supabase Auth, Storage, local stack, migrations, env vars, and generated clients are forbidden. Define the allowed replacements: Better Auth, local Postgres, Neon, Alembic, MinIO, R2, SOPS.

2. Add a worker-access runbook.

   Create the machine-local `WORKER-ACCESS.md` referenced by `AGENTS.md`, with SOPS pointers and exact commands for Cloudflare, GitHub, Neon, and any future auth/storage provider. Do not put plaintext secrets in it.

3. Add root orchestration scripts.

   Match writing-system's daily shape with kai-chattr names:

   - `dev`: start devdocs and web after backend probes pass.
   - `dev:web`: run `apps/web`.
   - `dev:devdocs`: run Fumadocs.
   - `local:api:secrets`: start the API with SOPS-injected env.
   - `local:api:recover`: restart API with fresh SOPS env.
   - `local:postgres:start|stop|status`.
   - `local:minio:start|stop|bootstrap|status`.
   - `runtime:probe` or `api:probe-reachable`.
   - `local:verify`.
   - `test:no-supabase-contract`.

4. Add a port registry.

   Keep the existing app ports unless Jon changes them:

   - web: `8800`
   - API/WebSocket: `8840`
   - MCP HTTP: `8841`
   - MCP SSE: `8842`

   Add locked ports for devdocs, local Postgres, MinIO API, and MinIO console before implementation. Do not scatter port literals through scripts.

5. Add Fumadocs devdocs.

   Strict writing-system parity includes a local docs surface. Kai-chattr currently has root `docs/`, but no `apps/devdocs` in the current tree. Add a Fumadocs app only after the contract decides whether source docs stay in root `docs/` and are rendered by devdocs, or whether canonical content moves under `apps/devdocs/content`.

6. Decide the API container boundary.

   Writing-system runs the platform API in Docker. Kai-chattr controls local CLI agents, terminals, MCP injection, and host focus. A naive Docker-only API can break that. For strict parity, use one of these:

   - Preferred strict shape: containerize the HTTP/API control plane and split host-only launcher/terminal control into an explicit host runner bridge.
   - Kai-chattr exception: keep API as a host process, but lock this as an intentional divergence and keep writing-system-style scripts, probes, and tests.

   Do not silently keep the host-process model while calling it strict parity.

7. Add persistence/data-plane rules.

   Current kai-chattr runtime data is file/store backed under `services/api`. If strict parity includes the writing-system data-plane role, introduce local Postgres and hosted Neon with Alembic migrations owned by `services/api`. If file stores remain, document them as a local-only runtime store and add a later migration decision.

8. Add storage parity.

   The current config has local uploads under `services/api`. Strict parity needs a storage contract:

   - local: MinIO S3-compatible endpoint,
   - hosted: Cloudflare R2,
   - code: one S3-compatible adapter,
   - secrets: SOPS only,
   - no Supabase Storage.

9. Add health and data-plane probes.

   Add endpoints and scripts equivalent in purpose to writing-system's ready/data-plane checks:

   - API ready,
   - web proxy reachability,
   - MCP HTTP/SSE reachability,
   - auth/session mode,
   - DB mode,
   - storage mode,
   - no legacy `E:\chattr` dependency,
   - no Supabase dependency.

10. Amend the existing draft parity plan.

   `docs/plans/kai-chattr-architecture-runtime-parity-implementation-plan.md` is close for root scripts, ports, probes, and no-Supabase controls. It is not strict enough if the new requirement requires every writing-system operating role, because it currently says:

   - no Fumadocs work in this phase,
   - no Docker-only backend requirement,
   - no database migrations,
   - current file/store runtime remains in this phase.

   Those exclusions must either be removed or preserved as explicitly approved kai-chattr-specific divergences.

## Recommended sequence

1. Contract amendment: lock "writing-system operating parity, no Supabase" in `architecture.json` and `backend.json`.
2. Port registry: add one source of truth for `8800/8840/8841/8842` plus docs, Postgres, and MinIO ports.
3. Root scripts: add SOPS-injected startup and probe commands.
4. API boundary: decide container+host-runner bridge vs explicit host-process exception.
5. Devdocs: add Fumadocs or explicitly defer it as a non-strict variance.
6. Data/storage: add local Postgres/Neon and MinIO/R2 only after the data contract is locked.
7. Tests: add no-Supabase, port-drift, runtime-probe, no-legacy-runtime, and browser acceptance gates.

## Non-negotiables

- Do not add Supabase packages, env vars, local-stack scripts, migrations, generated clients, storage, or Auth.
- Do not copy writing-system product code.
- Do not restore legacy `E:\chattr\static` as the visual/component target.
- Do not expose raw session tokens through an unauthenticated REST endpoint.
- Do not containerize agent/terminal launch paths without proving host-control behavior still works.
- Do not claim strict parity until every intentional difference is named in governance.

