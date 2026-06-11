# kai-chattr deployed stack — how pushes become the online environment

Worker reference (verified live 2026-06-11). Read this before touching deploys,
workflows, secrets, or anything under `services/api/requirements.txt`.

## Stack map

```
Browser
  └─ Cloudflare Pages project `kai-chattr`
       ├─ static Vite build of apps/web (client keeps RELATIVE /api paths)
       └─ Pages Functions proxies (apps/web/functions/):
            api/[[path]].js, observability/, uploads/, docs/, openapi.json.js, redoc.js
            → inject KAI_CHATTR_SESSION_TOKEN server-side
            → forward to the Fly API origin (resolved by hostname, see below)
  └─ Fly.io API (FastAPI, internal port 8840)
       ├─ prod: app `kai-chattr-api`      (services/api/fly.prod.toml)
       └─ dev:  app `kai-chattr-api-dev`  (services/api/fly.dev.toml)
       release_command = "alembic upgrade head"  → migrations run on EVERY deploy
  └─ Neon Postgres (one project, dev + prod separation)
       ├─ pooled URL  → KAI_CHATTR_DATABASE_URL            (runtime)
       └─ direct URL  → KAI_CHATTR_MIGRATION_DATABASE_URL  (Alembic)
```

## Branch → environment mapping

| Branch | Web | API | URLs |
|---|---|---|---|
| `main` | Pages production | Fly `kai-chattr-api` | https://kai-chattr.pages.dev → https://kai-chattr-api.fly.dev |
| `dev` | Pages branch preview | Fly `kai-chattr-api-dev` | https://dev.kai-chattr.pages.dev → https://kai-chattr-api-dev.fly.dev |

Workflows (`.github/workflows/`):

- `deploy-web.yml` — push to `main`/`dev` touching `apps/web/**` (or the workflow file) → build + `wrangler pages deploy`.
- `deploy-api.yml` — push to `main`/`dev` touching `services/api/**` (or the workflow file) → requirements-sync gate → `flyctl deploy`.
- `backmerge-main-to-dev.yml` — every push to `main` merges main into `dev` (PR on conflict).

**Backmerge caveat:** backmerge pushes use `GITHUB_TOKEN`, which does **not**
trigger workflows. After a main push backmerges into dev, the dev *code* is
current but the dev *deployments* are not. They update on your next direct push
to `dev`, or run manually:

```
gh workflow run deploy-api.yml --ref dev
gh workflow run deploy-web.yml --ref dev
```

## The daily flow

```
git switch dev && git pull --ff-only      # work on dev
...commit...
git push origin dev                       # → dev stack deploys (path-filtered)
# promote: merge/PR dev → main            # → prod deploys + auto backmerge to dev
```

## Hard rules (each one broke something once)

1. **`services/api/requirements.txt` must mirror `pyproject.toml` `[project].dependencies`.**
   The Dockerfile installs `requirements.txt`; pyproject is what devs edit. Drift
   crashed the Alembic release command (`ModuleNotFoundError`) and silently failed
   every API deploy for days (2026-06-11). Gated by
   `pnpm run check:python-requirements-sync` (also runs inside `check:deps` and as
   the first step of `deploy-api.yml`).
2. **Never bake `VITE_KAI_CHATTR_API_ORIGIN` into CI web builds.** The deployed
   client must keep relative `/api` paths so the Pages Function proxy handles
   them (same-origin, token injected server-side). That env var is a local-dev
   escape hatch only (`apps/web/src/lib/chattr-api.ts`).
3. **Secrets flow through SOPS only** (`secrets/dev/*.yaml`). To (re)stage Fly
   runtime secrets: `pnpm run fly:dev:secrets` / `pnpm run fly:prod:secrets`
   (wraps `scripts/deploy/sync-fly-secrets-from-sops.ps1`). Never plaintext,
   never committed.
4. **CORS on the Fly apps allows only the matching Pages branch alias**
   (`KAI_CHATTR_ALLOWED_ORIGINS` in the fly tomls). Per-deployment preview URLs
   (`<hash>.kai-chattr.pages.dev`) are not allowed — use the branch alias.

## Secrets inventory (names only)

- GitHub Actions (set 2026-06-07): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `FLY_API_TOKEN`.
- Fly apps (both): `KAI_CHATTR_DATABASE_URL`, `KAI_CHATTR_MIGRATION_DATABASE_URL`, `KAI_CHATTR_SESSION_TOKEN`.
- Cloudflare Pages env (per environment): `KAI_CHATTR_SESSION_TOKEN` (required — proxy returns 500 without it), `KAI_CHATTR_API_ORIGIN` (optional — hostname default: `kai-chattr.pages.dev` → prod API, anything else → dev API).
- SOPS sources: `secrets/dev/{fly,neon,auth,cloudflare,llm-providers}.yaml`.

## Verifying the deployed stack

```powershell
curl https://kai-chattr-api.fly.dev/healthz          # prod API direct
curl https://kai-chattr-api-dev.fly.dev/healthz      # dev API direct
curl https://kai-chattr.pages.dev/api/user/account     # prod, through the Pages proxy
curl https://dev.kai-chattr.pages.dev/api/user/account # dev, through the Pages proxy
```

- `/healthz` lives at the API **root**; `pages.dev/api/healthz` will always 404
  because the proxy forwards paths as-is. A FastAPI-style `{"detail":"Not Found"}`
  from `pages.dev/api/...` still proves the proxy chain works (request reached
  FastAPI) — it usually means the deployed API predates the route you're probing.
- Deploy status: `gh run list --limit 10`. A failing `Deploy API to Fly` with a
  `ModuleNotFoundError` in the release command = rule 1 above.

## Neon's role

Neon is the API database for both environments — it has no deploy step of its
own. Schema changes ship as Alembic migrations inside the API deploy
(`release_command`). Pre-checks from local: `pnpm run neon:dev:db:status`,
`pnpm run neon:dev:migrate` (optional; the deploy migrates anyway). Local API
against Neon dev: `pnpm run neon:dev:api`, or full local stack `pnpm run dev`
(maps `NEON_DEV_DATABASE_URL` → postgres mode when run under
`sops exec-env secrets/dev/neon.yaml`).
