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

## Browser view

- Generated docs live under `apps/devdocs/content/contracts/`.
- Do not hand-edit generated contract MDX.
- Regenerate with `node governance/scripts/build-contract-docs.mjs`.
- Validate with `node governance/scripts/check-contracts.mjs`.
