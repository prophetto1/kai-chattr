# Kai-chattr writing-system parity without Supabase

Status: investigation note, partially updated after Neon/Alembic data-plane work
Date: 2026-06-07
Scope: `E:\kai-chattr` operating parity with `E:\writing-system`, with every Supabase role replaced or excluded.

## Answer

Kai-chattr can match the operating shape of `E:\writing-system` without adopting Supabase, but the current repo is still only partway there. The first Neon/Alembic API data-plane slice now exists for Board rules.

Current kai-chattr already has the right broad application split:

- `apps/web`: Vite/React workbench.
- `services/api`: Python FastAPI backend with MCP, WebSocket, launcher, runtime events, SQLAlchemy, SQLAdmin, Alembic, and uv.
- `governance/`: dependency allowlist and contracts.

It still does not have the full writing-system operating shape:

- no `apps/devdocs` Fumadocs app in the current tree,
- no `services/api/Dockerfile`,
- no full stack across storage, auth, backend deploy/container boundary, and probes,
- no full Postgres/Neon data-plane migration beyond the initial Board rules slice,
- no MinIO/R2 storage parity contract,
- no Better Auth service,
- no writing-system-style health/data-plane probe set.

Already present after the 2026-06-07 data-plane work:

- root `dev` orchestration for web/API local runtime,
- `WORKER-ACCESS.md` with SOPS command patterns,
- SOPS-encrypted Neon dev/prod database URLs in `secrets/dev/neon.yaml`,
- Neon dev/prod API database scripts: `neon:dev:*` and `neon:prod:*`,
- Alembic scaffold under `services/api`,
- initial `board_rules` and `board_rule_state` migration,
- API store factory that keeps file storage as default and uses SQLAlchemy when `KAI_CHATTR_DATABASE_URL` is injected.

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

- Root scripts expose `dev`, web build/dev/preview, runtime/contract checks, and Neon dev/prod API database commands.
- `apps/web` runs Vite on `127.0.0.1:8800`.
- `apps/web/vite.config.ts` proxies `/api`, `/uploads`, and `/ws` to `127.0.0.1:8840`.
- `services/api/config.toml` declares API/WebSocket `8840`, MCP HTTP `8841`, and MCP SSE `8842`.
- `services/api` declares FastAPI, Uvicorn, SQLAlchemy, SQLAdmin, Alembic, psycopg2, pydantic-settings, Ruff, and pytest.
- `governance/contracts/architecture.json` says `apps/web` deploys a Vite static build to Cloudflare Pages.
- `governance/contracts/backend.json` has no locked backend rules yet.
- `WORKER-ACCESS.md` exists and points workers to SOPS `exec-env` commands for Cloudflare, Fly, Neon, auth, and LLM provider secrets.
- The existing runtime parity plan deliberately excludes Fumadocs and Docker-only API startup in its current phase. Under a stricter requirement, those exclusions must be amended or explicitly re-ratified as kai-chattr-specific exceptions.

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
  -> Neon-backed API persistence
  -> local object storage
  -> local auth/session issuer when product auth exists
  -> no legacy E:\chattr runtime dependency
  -> no Supabase
```

## Supabase replacement map

| Writing-system role | Kai-chattr no-Supabase equivalent |
|---|---|
| Supabase Auth | Better Auth service if product user auth is needed. If kai-chattr remains local operator-only, keep the session-token control model and document it as a local runtime control, not product auth. |
| Supabase Postgres | Neon dev and production Postgres. No local Docker Postgres path unless Jon explicitly reverses this decision. |
| Supabase migrations | Alembic owned by `services/api`. No Supabase CLI and no Supabase migration files. |
| Supabase Storage | MinIO locally and Cloudflare R2 in hosted environments, using one S3-compatible storage contract. |
| Supabase local stack scripts | Neon dev/prod database scripts, future storage scripts, and probe scripts owned by kai-chattr. |
| Supabase env vars/secrets | SOPS files with kai-chattr names only. No `SUPABASE_*` variables. |
| Supabase generated/browser clients | None. Browser talks to kai-chattr API and auth client only. |

## Required changes

1. Lock the no-Supabase topology in governance.

   Add backend and architecture rules stating that Supabase Auth, Storage, local stack, migrations, env vars, and generated clients are forbidden. Define the allowed replacements: Better Auth, Neon, Alembic, MinIO, R2, SOPS.

2. Worker-access runbook is present.

   `WORKER-ACCESS.md` exists and points workers to SOPS command patterns. Future provider additions must extend that file without adding plaintext secrets.

3. Root orchestration scripts are partial.

   Present:

   - `dev`: starts the kai-chattr local web/API runtime.
   - `web:dev`: runs `apps/web`.
   - `neon:dev:api`: starts the API with the Neon dev database URL.
   - `neon:dev:migrate` and `neon:dev:db:status`.
   - `neon:prod:migrate` and `neon:prod:db:status`.
   - `runtime:probe`.
   - `test:no-supabase-contract`.

   Still missing for stricter parity:

   - `dev:devdocs` because kai-chattr currently does not need devdocs.
   - `local:minio:start|stop|bootstrap|status`.
   - `local:verify`.

4. Add a port registry.

   Keep the existing app ports unless Jon changes them:

   - web: `8800`
   - API/WebSocket: `8840`
   - MCP HTTP: `8841`
   - MCP SSE: `8842`

   Add locked ports for devdocs, MinIO API, and MinIO console before implementation. Do not scatter port literals through scripts.

5. Add Fumadocs devdocs.

   Strict writing-system parity includes a local docs surface. Kai-chattr currently has root `docs/`, but no `apps/devdocs` in the current tree. Add a Fumadocs app only after the contract decides whether source docs stay in root `docs/` and are rendered by devdocs, or whether canonical content moves under `apps/devdocs/content`.

6. Decide the API container boundary.

   Writing-system runs the platform API in Docker. Kai-chattr controls local CLI agents, terminals, MCP injection, and host focus. A naive Docker-only API can break that. For strict parity, use one of these:

   - Preferred strict shape: containerize the HTTP/API control plane and split host-only launcher/terminal control into an explicit host runner bridge.
   - Kai-chattr exception: keep API as a host process, but lock this as an intentional divergence and keep writing-system-style scripts, probes, and tests.

   Do not silently keep the host-process model while calling it strict parity.

7. Persistence/data-plane rules are partial.

   Neon dev/prod command paths and Alembic ownership under `services/api` now exist. The first migrated slice is Board rules. Jobs, locked records, pins, messages, sessions, uploads, and storage still need explicit migration decisions.

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

   `docs/plans/kai-chattr-architecture-runtime-parity-implementation-plan.md` was close for root scripts, ports, probes, and no-Supabase controls. It is now partially implemented and stale in places. It is not strict enough if the requirement requires every writing-system operating role, because it originally said:

   - no Fumadocs work in this phase,
   - no Docker-only backend requirement,
   - no database migrations,
   - current file/store runtime remains in this phase.

   The database-migration exclusion is no longer accurate for Board rules. Remaining exclusions must either be removed or preserved as explicitly approved kai-chattr-specific divergences.

## Recommended sequence

1. Contract amendment: lock "writing-system operating parity, no Supabase" in `architecture.json` and `backend.json`.
2. Port registry: add one source of truth for `8800/8840/8841/8842` and any future docs/MinIO ports.
3. Root scripts: add remaining recovery, local verify, and future MinIO commands.
4. API boundary: decide container+host-runner bridge vs explicit host-process exception.
5. Devdocs: add Fumadocs or explicitly defer it as a non-strict variance.
6. Data/storage: continue Postgres/Neon migration beyond Board rules and add MinIO/R2 only after the data contract is locked.
7. Tests: add no-Supabase, port-drift, runtime-probe, no-legacy-runtime, and browser acceptance gates.

## Non-negotiables

- Do not add Supabase packages, env vars, local-stack scripts, migrations, generated clients, storage, or Auth.
- Do not copy writing-system product code.
- Do not restore legacy `E:\chattr\static` as the visual/component target.
- Do not expose raw session tokens through an unauthenticated REST endpoint.
- Do not containerize agent/terminal launch paths without proving host-control behavior still works.
- Do not claim strict parity until every intentional difference is named in governance.
