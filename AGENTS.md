# AGENTS.md — kai-chattr

**AI workers: first read `WORKER-ACCESS.md`** (machine-local, gitignored). It lists what
infrastructure access is already provisioned and the exact `sops exec-env` commands to use it.

## Core rule

Access — Cloudflare, GitHub, and Neon — is **already granted** and reachable via **SOPS**. Do
**not** tell Jon to "log in", "re-auth", or "go set this up" for anything already provisioned;
use the SOPS commands in `WORKER-ACCESS.md`. Only a genuinely new owner-only grant (new account,
billing, OAuth app) warrants a one-time, concise ask — then do the rest yourself.

## Source of truth

This is a **clean migration** from the legacy `chattr` repo (reference/source only — never the
target). Build to the **chattr design standard — v3** and the contracts in `governance/`. Do not
port the legacy `static/` UI as-is.

## Frontend component rule

`apps/web` must use real source components from the approved component foundation:

- UI primitives come from shadcn/ui source components.
- AI, chat, prompt, terminal, file-tree, code, and workbench surfaces come from Vercel AI Elements
  / AI SDK React source components.
- Local components may compose those approved source components.
- Approved third-party engines may power a surface inside a locally composed component when they
  are strictly stronger than the equivalent AI Element: Monaco for code/diff editors,
  react-arborist for large/virtualized file trees (ratified by Jon, 2026-06-12). The local
  component still owns the surface; the engine replaces only the rendering core. This is not a
  license to handroll.
- Local components must not replace them with bespoke approximations, placeholder primitives, or
  handrolled components named as if they were shadcn or Vercel AI Elements.

Legacy `E:/chattr/static` is behavior reference only. It is not the visual, component, or design
system target.

## Secrets

SOPS only. Never write plaintext secrets to any file (a `.gitignore` is not protection). Docs
reference SOPS pointers + commands, never raw values.

## Governance

Every file must conform to `governance/` contracts. The dependency allowlist
(`governance/contracts/architecture.json`) grows **one migrated slice at a time** — confirm a dep, add it,
then move the code. Nothing is enforced until Jon confirms it (decide → encode → render).

## Deploy

Push to `main` → GitHub Action deploys to Cloudflare Pages (production). Branch deploys → preview.
No manual step.

## Python environment (`services/api`)

- `services/api/.venv` is machine-local and uv-managed. Never commit it (it is gitignored), never
  edit it by hand, never point tooling at its interpreter directly.
- `services/api/uv.lock` + `pyproject.toml` are the dependency source of truth and are tracked.
- Always launch and test through `uv run` from `services/api` (e.g. `uv run python -m app.cli`,
  `uv run python -m pytest`). Never invoke a bare global interpreter with `-m app.cli` — it does
  not resolve the project venv and the server fails to bind.
- Rebuild a broken environment by deleting `.venv` and running `uv sync`; do not patch it in place.

@RTK.md
