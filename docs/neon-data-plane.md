# Kai-chattr Neon data plane

Status: current as of 2026-06-07

## Source of truth

Neon is the dev and production Postgres provider for kai-chattr. Do not add a local Docker Postgres path or local Postgres fallback unless Jon explicitly reverses this decision.

| Runtime surface | Target |
| --- | --- |
| Dev Postgres | Neon cloud dev branch |
| Prod Postgres | Neon production/default branch |
| Local Docker Postgres | No |
| Local Postgres fallback | No |
| Why Neon | It gives a real cloud dev branch instead of recreating Supabase local-stack behavior. |
| Runtime implication | Fly API connects to Neon through provider-managed env vars staged from SOPS. Cloudflare Pages receives only public API origin config. |

## Neon project

Kai-chattr owns its own Neon project. Do not point this repo at the legacy `chattr` repo, the
`blockdata` Neon project, or another repo's database.

| Item | Value |
| --- | --- |
| Neon project name | `kai-chattr` |
| Neon project id | `little-wave-82499087` |
| Region | `aws-us-east-2` |
| Postgres version | `17` |
| Production branch | `main` / `br-flat-darkness-ajlke1wd` |
| Development branch | `dev` / `br-weathered-field-aj5fe7gp` |
| Production endpoint | `ep-bold-hall-ajt1lp7r` |
| Development endpoint | `ep-rapid-tree-ajmqun7v` |
| Database | `neondb` |
| Role | `neondb_owner` |

Runtime URLs in SOPS must map to the pooled `-pooler` endpoint. Migration URLs must map to the
direct endpoint. On 2026-06-07, `secrets/dev/neon.yaml` was corrected to this kai-chattr project
and both `dev` and `main` were migrated to Alembic head.

Secrets stay encrypted under `secrets/dev/`. Use `WORKER-ACCESS.md` for the SOPS command pattern. Do not create plaintext `.env` files.

Required SOPS keys in `secrets/dev/neon.yaml`:

- `NEON_DEV_DATABASE_URL`
- `NEON_DEV_DIRECT_DATABASE_URL`
- `NEON_PROD_DATABASE_URL`
- `NEON_PROD_DIRECT_DATABASE_URL`

Required SOPS key in `secrets/dev/fly.yaml`:

- `FLY_API_TOKEN`

## Ports

- Web: `8800`
- API and WebSocket: `8840`
- MCP HTTP: `8841`
- MCP SSE: `8842`

## Alembic

Alembic is mandatory for API-owned schema changes. Migrations live under `services/api/migrations`.

Use `NEON_*_DIRECT_DATABASE_URL` for Alembic migrations. Do not run migrations through a pooled `-pooler` URL.

Alembic stores kai-chattr migration state in `kai_chattr_alembic_version`, not the default shared `alembic_version` table.

Run dev migrations:

```powershell
pnpm run neon:dev:migrate
```

Run production migrations:

```powershell
pnpm run neon:prod:migrate
```

## Dev database

Check the dev database connection:

```powershell
pnpm run neon:dev:db:status
```

Start the API against Neon dev:

```powershell
pnpm run neon:dev:api
```

## Production database

Check the production database connection:

```powershell
pnpm run neon:prod:db:status
```

Production API runtime receives the production database URL through the deploy environment. Do not run normal local development against the production URL.

Production branch protection is required before treating Neon main as hardened production. On 2026-06-07, the Neon API set the kai-chattr `main` branch to `protected: true`.

## Hosted API deploy

Fly apps:

- Dev API: `kai-chattr-api-dev`
- Production API: `kai-chattr-api`

The hosted API uses `services/api/app/asgi.py`. It requires `KAI_CHATTR_SESSION_TOKEN`; hosted startup fails closed if the token is missing. The local CLI path can still generate an in-memory token for local-only runs.

Stage Fly runtime secrets from SOPS:

```powershell
pnpm run fly:dev:secrets
pnpm run fly:prod:secrets
```

Those scripts import these Fly app secrets without writing plaintext files:

- `KAI_CHATTR_DATABASE_URL`
- `KAI_CHATTR_MIGRATION_DATABASE_URL`
- `KAI_CHATTR_SESSION_TOKEN`

On 2026-06-07, both `kai-chattr-api-dev` and `kai-chattr-api` had Fly secrets staged from the corrected kai-chattr Neon SOPS values. A deploy or machine update is required before staged Fly secrets take effect on running VMs.

Deploy mapping:

- `dev` branch deploys `services/api/fly.dev.toml` to `kai-chattr-api-dev`.
- `main` branch deploys `services/api/fly.prod.toml` to `kai-chattr-api`.
- Fly release commands run `alembic upgrade head`.

## Cloudflare frontend deploy

`apps/web` builds as static Vite output and deploys to Cloudflare Pages.

- `dev` branch builds with `VITE_KAI_CHATTR_API_ORIGIN=https://kai-chattr-api-dev.fly.dev`.
- `main` branch builds with `VITE_KAI_CHATTR_API_ORIGIN=https://kai-chattr-api.fly.dev`.
- Cloudflare Pages must not receive database URLs, Neon API keys, or session tokens.

## Current database scope

The first Postgres-backed slice is Board rules:

- The initial migration creates `board_rules` and `board_rule_state`.
- `services/api/app/stores/factory.py` selects file storage by default and SQLAlchemy storage when `KAI_CHATTR_DATABASE_URL` is injected.
- SOPS scripts map the selected Neon URL into `KAI_CHATTR_DATABASE_URL`.
- Alembic scripts use `NEON_DEV_DIRECT_DATABASE_URL` or `NEON_PROD_DIRECT_DATABASE_URL`.

Jobs, locked records, pins, messages, sessions, uploads, and storage are not yet migrated to Postgres or object storage.

## Verification

Useful checks:

```powershell
pnpm run test:runtime-contract
pnpm run test:no-supabase-contract
pnpm run check:contracts
pnpm run check:deps
```

API database tests:

```powershell
Set-Location services/api
$env:UV_PROJECT_ENVIRONMENT="$env:LOCALAPPDATA\uv\envs\kai-chattr-services-api"
uv run pytest -q tests/test_database_runtime.py
```
