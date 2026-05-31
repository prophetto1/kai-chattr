# governance/

Machine-enforced conformance for kai-chattr. The principle: **define what is allowed, then make everything else impossible to introduce.** Not guidelines — gates.

## Contracts: source of truth → generated docs → enforcement

A **contract** is a machine-readable rule. The flow is one-directional:

1. **Source of truth — `governance/contracts/*.json`** (JSON only, never YAML). Jon authors these.
2. **In-browser view — generated.** A reader script renders each JSON to a docs page. The rendered page is **derived; never hand-edited.**
3. **Enforcement — scripts read the same JSON** and fail the gates if violated. Doc and gate share one source, so they cannot drift.

## The contracts

A small set of multi-rule **domain** contracts, not one file per topic:

| File | Domain |
|---|---|
| `contracts/design-system.json` | tokens (incl. day/night), typography, spacing/radius, elevation, motion, icons |
| `contracts/frontend.json` | app shell (7 regions), navigation, page states, components, composition leveling, a11y |
| `contracts/backend-api.json` | endpoint shape, error envelope, auth/session, pagination, telemetry |
| `contracts/coordination.json` | multi-agent protocol: roles, ground-truth ledger, gate-runner, step board, message discipline, turn-taking |
| `contracts/data.json` | identity, migrations, naming |
| `contracts/repo-process.json` | secrets (SOPS), Python toolchain, imports, file naming, commit conventions |
| `allowed-deps.json` | the live, machine-enforced dependency allowlist (its own file) |

`registry.json` is the index. Day/night is a **rule** inside `design-system`, never its own file.

## Lifecycle

`planned` → `drafting` → `locked`. A rule is locked only when Jon confirms it, and only as a
migrated slice needs it. Do not pre-author a speculative taxonomy. Add a dependency to
`allowed-deps.json` **before** moving the code that needs it.
