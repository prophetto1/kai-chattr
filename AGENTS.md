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

## Secrets

SOPS only. Never write plaintext secrets to any file (a `.gitignore` is not protection). Docs
reference SOPS pointers + commands, never raw values.

## Governance

Every file must conform to `governance/` contracts. The dependency allowlist
(`governance/allowed-deps.json`) grows **one migrated slice at a time** — confirm a dep, add it,
then move the code. Nothing is enforced until Jon confirms it (decide → encode → render).

## Deploy

Push to `main` → GitHub Action deploys to Cloudflare Pages (production). Branch deploys → preview.
No manual step.
