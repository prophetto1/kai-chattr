# governance/

Machine-enforced governance for kai-chattr.

## Contract source set

| File | Purpose |
|---|---|
| `contracts/frontend.json` | frontend + design system rules |
| `contracts/backend.json` | backend + API + database rules |
| `contracts/architecture.json` | stack + dependency policy + repo and process rules, including dependency allowlist data |

## Locking rule

- Keep `rules[]` empty until a migrated slice needs a rule.
- Agents may draft rule text for review.
- Jon flips `locked:true`.
- Do not pre-fill a taxonomy.

Current locked frontend rule:

- `contracts/frontend.json` locks the `apps/web` component foundation: shadcn/ui source components
  for UI primitives and Vercel AI Elements / AI SDK React source components for AI/workbench
  surfaces. Handrolled replacement primitives are not acceptable.

## Validation

- Validate with `node governance/scripts/check-contracts.mjs`.
- Validate npm dependency declarations with `node governance/scripts/check-deps.mjs`.
- The local devdocs app has been removed; contract source lives in `governance/contracts/`.
