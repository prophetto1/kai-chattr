# Handoff — Typography & Theme Model (kai-chattr)

**Status:** corrected plan, not yet built. **Branch:** `dev`. **Author of this handoff:** Claude, 2026-06-14.
**Read this top-to-bottom before touching code. It is self-contained — you should not need prior context.**

---

## 0. One-paragraph summary

The app's typography was migrated onto a named **role ladder** (`design-system.json` → `typographyStyle(role)`), and an in-browser **font-family picker** was shipped (Settings → Appearance: pick a typeface per family slot, applies live, persists). **What it does NOT do — and what this handoff exists to fix:** font **sizes / weights / line-heights** are baked into the JS bundle at build time, so they can't be changed in-browser, can't be seen in one place, and can't be carried by a theme; and **themes are color-only CSS classes**, not addable files. The correction: **tokenize the whole ladder as runtime CSS variables**, make a **theme a single JSON file that carries colors + typography**, and build an **Appearance role editor** for full visibility + per-role font/size editing. Build it in the ordered steps in §5; verify each **live in the browser**, not just by building.

---

## 1. Repo facts you need to operate (zero-context)

| Thing | Value |
|---|---|
| Repo root | `E:\kai-chattr` |
| Working branch | `dev` (never push to `main`; PRs go main) |
| Web build | `pnpm --dir apps/web run build` (run from repo root; ~50s; must exit 0) |
| Web typecheck only | `pnpm --dir apps/web exec tsc --noEmit` |
| Backend tests | from `services/api`: `uv run --with pytest pytest -q` (tests are `unittest`-style; the env has no global pytest, so `--with pytest`) |
| Dev stack (DB-backed) | `pnpm run neon:dev:runtime` (SOPS-injects Neon URL; works non-interactively here). Spawns API + Vite. |
| Ports | **web (Vite) = 8800**, **API = 8840** (8800 proxies `/api` → 8840). mcp 8841/8842, otel 8837/8838, jaeger 8886. Source: `scripts/lib/kai-chattr-dev-ports.mjs`. |
| Restart the dev stack | It's orchestrated by `node scripts/dev/start-kai-chattr.mjs` (one parent that spawns API+Vite and tears both down if one dies). To restart: `taskkill /PID <orchestrator-node-pid> /T /F` (find via `Get-NetTCPConnection -LocalPort 8800`), then relaunch `pnpm run neon:dev:runtime`. **The API caches the settings schema at import (no `--reload`) — any backend schema change needs this restart.** |
| Live-verify URL | `http://127.0.0.1:8800/settings/user/appearance` (the app auto-auths on loopback via local bootstrap; a fresh automated browser gets in without login). |
| Commit discipline | **Scoped commits only — never `git add -A`.** A concurrent worker shares this working tree (board/jobs work). Stage explicit paths. |
| Changelog | Append to repo-root `changelog.md` per change (newest first). |
| "Done" bar | A control that does not **visibly change the live app** is NOT done. Verify in the browser, not just the build. |

---

## 2. Current state — BUILT vs NOT

### Built (on `dev`, commits below)
- **Role ladder** — `apps/web/src/config/design-system.json` defines `fontFamilies` (4 slots) + `typography.roles` (~25 roles, each family+size+weight+line-height). Consumed by `lib/design-system.ts` → `typographyStyle(role)` returns a `CSSProperties` object.
- **Literal migration COMPLETE** — all 154 hardcoded `text-[Npx]` literals across 21 files replaced with `style={typographyStyle('<role>')}`. (`grep -rE "text-\[[0-9]" apps/web/src` → 0.) Commits `81533f8 … 098b8fe`.
- **Font-FAMILY picker (live-verified)** — Settings → Appearance has 4 pickers (Interface/Display/Reading/Mono). Selecting a face writes `--font-ui/--font-display/--font-prose/--font-mono` on `<html>` via `root.style.setProperty`, persisted to `data/settings.json` `fonts:{}`, re-applied on load. Faces loaded via `@fontsource`. Commits `0c34bd8` (faces+catalog) + `387c00a` (wiring) + `2e32ac6` (changelog). **Verified live 2026-06-14: pick Display→Space Grotesk flips `--font-display` live + persists across reload.**

### NOT working — the gap this handoff closes
1. **Size / weight / line-height are build-time literals.** `typographyStyle` inlines `fontSize: '28px'` etc. from `design-system.json` at bundle time → cannot be changed in-browser, by a theme, or seen anywhere. (Family works *only* because it routes through a CSS var.)
2. **No visibility.** There is no surface that shows every role's resolved family/size/weight or where it's used.
3. **No granular edit.** You cannot change one role's size, or one role's font+size, in the browser. The picker is whole-family-only.
4. **Themes are color-only CSS.** The 5 themes (`.dark/.catppuccin/.ember/.graphite` + base) are CSS class palettes in `tokens.css` + `x-options` in `workbench_settings.schema.json`. They carry **zero** typography. **Adding a theme = write a CSS palette block + register in schema (+`.py` mirror) + restart** — not a drop-in JSON file.

---

## 3. Root cause (so it isn't repeated)

The visible picker was built **before** the data model. Family-switching shipped only because `--font-*` already existed as runtime CSS vars; everything else (sizes, themes) was build-time/CSS, so nothing downstream could change it. **Correction order is: data model first (runtime vars), then the editor UI.** Do not add more to the picker.

---

## 4. Target architecture (the correction)

### 4.1 Tokenize the whole ladder as runtime CSS variables  *(the foundation; everything depends on this)*
- For every role emit CSS custom properties: `--type-<role>-size`, `--type-<role>-weight`, `--type-<role>-line` (and `--type-<role>-tracking` where used). Family already resolves `--font-<slot>`.
- Generate `:root` **defaults** from `design-system.json` (the base ladder). Recommended mechanism: a tiny module that, at app boot, injects a `<style>` setting `:root { --type-display-title-size: 28px; … }` for every role from the imported JSON (no build step, single source of truth). A generated `.css` partial is the alternative.
- `typographyStyle(role)` returns **vars** instead of literals: `{ fontFamily: var(--font-<slot>), fontSize: var(--type-<role>-size), fontWeight: var(--type-<role>-weight), lineHeight: var(--type-<role>-line), … }`.
- Result: **every role's size/weight/family is now runtime-changeable by writing a variable** — the exact mechanism the font picker already proves.

### 4.2 A theme = ONE JSON file (colors + typography)  *(why colors live in it: a theme is the whole look, not just a palette; splitting color/type recreates the current fragmentation)*
Shape (all fields optional — a theme is an **override over the base**, so it can be complete OR partial, and partials layer):
```jsonc
{
  "id": "graphite",
  "label": "Graphite",
  "colorScheme": "dark",
  "colors":  { "--background": "…", "--foreground": "…", "…": "…" },   // token overrides
  "type": {
    "scales": { "ui": 1.0, "display": 1.0, "prose": 1.0, "mono": 1.0 }, // per-family multiplier
    "roles":  { "display.title": { "family": "display", "size": "30px", "weight": 700, "line": "36px" } },
    "areas":  { "workbench.header": { "size": "15px" } }               // optional per-area (see 4.4)
  }
}
```
- **Runtime loader** applies a theme by setting the corresponding `--*` vars on `<html>` (colors → token vars; type → `--type-<role>-*`, scales → multiply role sizes). Unset fields fall through to the base `:root` defaults.
- **Adding a theme = drop/author one JSON file** (a themes dir, or stores, or settings) — no CSS, no restart.
- **Migrate the 5 built-in CSS themes to JSON** so there is one model, not two. `tokens.css` keeps only base `:root` primitives + the `@theme` Tailwind registration.

### 4.3 Appearance = role editor  *(delivers visibility + granularity)*
- A **table of every role**, grouped by family, showing: role name, **where it's used**, family / size / weight / line, and a **live sample** rendered in that role.
- Each row **inline-editable**: family dropdown + size/weight/line inputs → writes the var live + into the active theme draft.
- Per-family **scale** sliders + a global text-size.
- **Import theme** (drop a JSON) / **Export / Save as theme** (write the JSON).
- This replaces today's 4-picker `AppearanceSettings`.

### 4.4 Per-area overrides  *(Jon's "increase Display in a select area")*
- The role system is **per-role** (all `display.title` change together). Ship per-role editing first — it covers ~90%.
- For a genuinely single spot: a **named-slot** model. Components tag a region (`data-type-slot="workbench.header"`); the theme's `areas` map targets it; those slots get their own `--type-area-<slot>-*` vars resolved by a `typographyStyle`-like helper. Same variable mechanism, one extra layer. **Build after per-role works.**

---

## 5. Build sequence — each step VERIFIED LIVE in the browser before the next

| Step | Build | Live acceptance (must pass before moving on) |
|---|---|---|
| **1. Tokenize ladder → runtime vars** | Emit `--type-<role>-*` defaults to `:root` from `design-system.json`; `typographyStyle` returns vars. | In browser, set `--type-display-title-size` via devtools/console → a route heading visibly resizes. Build exit 0; 0 visual regressions on existing surfaces (sizes identical to before by default). |
| **2. JSON theme load + apply + migrate built-ins** | Theme loader applies colors+type vars on `<html>`; 5 built-ins converted to JSON; theme picker reads them. | Drop/select a JSON theme → colors **and** a type override both apply live + persist across reload. |
| **3. Appearance role editor** | Table of all roles + inline edit + per-family scale + import/export. | Open Appearance → see every role's family/size/weight + sample; edit one role's size+font → applies live + persists across reload; export → JSON; import that JSON → re-applies. |
| **4. (later) Per-area named slots** | `data-type-slot` + `areas` resolution. | Tag one area, override only it via theme `areas` → only that area changes. |

---

## 6. The base role ladder (current values — inline, the defaults Step 1 emits)

**Families (slot → CSS var → default face → selectable faces):**
- `ui` → `--font-ui` → inter → [inter, geist]
- `display` → `--font-display` → inter → [inter, space-grotesk, geist]
- `mono` → `--font-mono` → jetbrains → [jetbrains, ibm-plex-mono]
- `prose` → `--font-prose` → inter → [inter, source-serif, lora]

**Roles (role → family / size / weight / line-height / extras):**

| role | family | size | weight | line | extras |
|---|---|---|---|---|---|
| display.hero | display | 56 | 600 | 60 | ls -0.03em |
| display.title | display | 28 | 600 | 34 | ls -0.01em |
| display.subtitle | display | 20 | 500 | 26 | ls -0.01em |
| ui.lg | ui | 16 | 500 | 22 | |
| ui.md | ui | 14 | 400 | 20 | |
| ui.body | ui | 13 | 400 | 18 | ls -0.006em |
| ui.body-strong | ui | 13 | 500 | 18 | ls -0.006em |
| ui.body-sm | ui | 12 | 400 | 16 | |
| ui.label | ui | 12 | 500 | 16 | |
| ui.caption | ui | 11 | 400 | 16 | ls 0.005em |
| ui.overline | ui | 11 | 600 | 14 | ls 0.12em, UPPERCASE |
| ui.micro | ui | 10 | 400 | 14 | |
| prose.body | prose | 16 | 400 | 26 | |
| prose.h1 | display | 30 | 600 | 36 | ls -0.02em |
| prose.h2 | display | 22 | 600 | 28 | ls -0.02em |
| prose.h3 | display | 18 | 600 | 24 | ls -0.01em |
| prose.h4 | display | 16 | 600 | 22 | |
| code.block | mono | 13 | 400 | 20 | |
| code.inline | mono | 12 | 400 | 16 | |
| code.diff | mono | 11 | 400 | 18 | |
| code.stat | mono | 10 | 500 | 14 | tabular-nums |
| numeric | ui | 13 | 500 | 18 | tabular-nums |
| workbench.fileListHeader | ui | 11 | 500 | 16 | |
| workbench.fileRow | ui | 12 | 400 | 16 | (selected 500, rowHeight 22) |
| workbench.fileRowMeta | ui | 11 | 400 | 16 | |
| workbench.fileTreeStat | mono | 10 | 500 | 14 | tabular-nums |
| workbench.diffCode | mono | 11 | 400 | 18 | |

---

## 7. Exact file map (where to work)

| File | Role | Step it changes in |
|---|---|---|
| `apps/web/src/config/design-system.json` | Base ladder: `fontFamilies` (slots + face `options`) + `typography.roles`. **Source of the `:root` defaults.** | 1 (generator source) |
| `apps/web/src/config/design-system.schema.json` | JSON schema for the above (has `default`+`options` on fontFamily). | 1 if shape grows |
| `apps/web/src/lib/design-system.ts` | `typographyStyle(role)`, `rowTypographyStyle`, `fontSlotCatalog()`, `TypographyRoleName`. **`typographyStyle` must return vars.** | 1 |
| `apps/web/src/styles/tokens.css` | Base `:root` primitives + theme COLOR palettes (`.dark/.graphite/…`) + `@theme` registration. Add `:root --type-*` defaults; themes move OUT to JSON in Step 2. | 1, 2 |
| `apps/web/src/styles.css` | Entry (`@import` tokens.css + base element styles). | — |
| `apps/web/src/components/theme/AppThemeProvider.tsx` | Loads themes + settings; applies theme classes + `--font-*`; persists. **The runtime apply point — extend to apply color+type vars from theme JSON.** | 2, 3 |
| `apps/web/src/routes/settings.tsx` | `AppearanceSettings` (Theme select + 4 font pickers). **Becomes the role editor.** | 3 |
| `apps/web/src/lib/theme-api.ts` | Settings/theme API types + calls (`getSettings`, `patchSettings`, `getSettingsSchema`, `listThemes`). | 2, 3 |
| `apps/web/src/main.tsx` | `@fontsource` imports — add a face here when adding a slot option. | 2 (new faces) |
| `services/api/app/schemas/workbench_settings.schema.json` + `workbench_settings.py` | Settings schema/model: `selected_theme` + `fonts:{ui,display,prose,mono}`. Extend to persist active theme id + custom theme JSONs. | 2 |
| `services/api/app/main.py` | `get_settings`/`patch_settings` (~L1803), WS `update_settings` (~L1417), `get_themes`/`get_settings_schema`. | 2 |
| `data/settings.json` | Runtime-persisted settings (schemaless JSON; `selected_theme`, `fonts`). No DB migration needed for settings. | 2 |

---

## 8. Locked decisions / constraints (do not relitigate)
- **Typography is families-BY-ROLE** (ui/display/prose/mono), never "one font for everything."
- **`design-system.json` is the BASE ladder; themes are overrides/diffs over it.** Unset fields fall through to base.
- **A theme carries color + typography in one file** (that is why colors are in it — see §4.2).
- **No fake controls / no fallbacks** — if it doesn't change the live app, it's not done.
- **Scoped commits**, branch `dev`, update root `changelog.md`.

## 9. Open decisions for Jon (flag, don't guess)
- Final default **face set** per slot (current set is in §6; swap freely).
- **Where theme JSONs live**: a repo `themes/` dir (built-ins) + user themes in settings/stores? Decide storage + how custom themes are added.
- **Per-area slot taxonomy** (which regions get named slots).
- Two deferred earlier calls still open: workbench **chat** kept at 13px (`ui.body`) vs the ladder's 16px `prose.body`; `WorkbenchCompactRail` **brand wordmark** normalized 600→500.

## 10. Reference commits
`d291ce8`, `098b8fe`, `aa90424` (migration complete) · `0c34bd8`, `387c00a`, `2e32ac6` (font-family picker — the family-only baseline this plan extends; do not delete it, Step 1 tokenizes the same path).
