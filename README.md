# kai-chattr

Clean rebuild of **chattr** — a local coordination room where AI coding agents and humans share channels, @mention each other, and drive a proposal → approval loop in one thread. Migrated one verified piece at a time from the legacy `chattr` repo, governance-gated, no drift.

The frontend is built to the **chattr design standard — v3** (one token contract, a seven-region shell, agent-native message types). The legacy `chattr` `static/` UI (an `idt-theme.css` `!important` overlay over a forked DOM) is reference only and is not ported as-is.

## Layout

```
apps/         frontend (built to the v3 design standard)
services/     Python FastAPI backend (chat server, MCP bridge, agent wrappers)
packages/     shared code
governance/   machine-enforced conformance: contracts + architecture dependency allowlist + gates
docs/         design standard, migration plans, decisions
secrets/      SOPS-encrypted dev secrets (never plaintext)
```

## Migration model

Same as blockdata: a new clean repo, governance-gated, **one capability at a time**. The unit is `page/capability → required frontend → required server route → required data/secrets/deploy config → live verification`. Dependencies are added one slice at a time to `governance/contracts/architecture.json` under `allowedDeps`, never bulk-copied from legacy `chattr`.

## Access & secrets

See `AGENTS.md` → `WORKER-ACCESS.md` (machine-local, gitignored). SOPS only; no plaintext secrets.

## License

AGPL-3.0. See `LICENSE`.
