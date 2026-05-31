#!/usr/bin/env node
/**
 * Reads the contract SOURCE OF TRUTH in governance/ (JSON today; YAML once a
 * parser dep is approved) and GENERATES the in-browser fumadocs view at
 * apps/devdocs/content/contracts/. The MDX is derived — never hand-edited.
 *
 * To add a contract: drop `governance/contracts/<id>.json` (shape below),
 * add a row to `governance/contracts/registry.json`, then run this script.
 *
 * Contract JSON shape (all optional except id/title):
 *   { id, title, status, summary,
 *     rules: [{ text, locked? }],
 *     enforcedBy, enforcement: [string], openItems: [string] }
 *
 * Pure Node — no dependencies (consistent with the dep rule).
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..', '..')
const GOV = join(ROOT, 'governance')
const CDIR = join(GOV, 'contracts')
const OUT = join(ROOT, 'apps', 'devdocs', 'content', 'contracts')
mkdirSync(OUT, { recursive: true })

const EMOJI = { locked: '🔒', drafting: '✍️', planned: '⏳', elsewhere: '↗' }
const banner = (src) =>
  `{/* GENERATED from ${src} by governance/scripts/build-contract-docs.mjs — do not edit by hand. */}`
// Quote frontmatter values so colons/special chars stay valid YAML.
// JSON.stringify yields a double-quoted, escaped scalar (valid YAML), no deps.
const yamlStr = (s) => JSON.stringify(String(s ?? '').replace(/\n/g, ' '))
const fm = (title, description) =>
  `---\ntitle: ${yamlStr(title)}\ndescription: ${yamlStr(description)}\n---\n`

// --- index, from registry.json ---
const reg = JSON.parse(readFileSync(join(CDIR, 'registry.json'), 'utf8'))
let idx = fm('Platform Contracts', 'The registry of every enforced platform rule. Source of truth lives in governance/; this view is generated.')
idx += `\n# Platform Contracts\n\n${banner('governance/contracts/registry.json')}\n\n`
idx += `The machine-readable **source of truth lives in \`governance/\`** (JSON/YAML). This page is **generated** from it; the \`governance/\` scripts enforce that the source is never violated. Status: 🔒 locked · ✍️ drafting · ⏳ planned · ↗ elsewhere\n`
for (const cat of reg.categories) {
  idx += `\n## ${cat.name}\n\n| Contract | Status | Enforced by |\n|---|---|---|\n`
  for (const c of cat.contracts) {
    const name = c.page ? `[${c.title}](/contracts/${c.id})` : c.title
    idx += `| ${name} | ${EMOJI[c.status] || c.status} | ${c.enforcedBy} |\n`
  }
}
idx += `\n---\n\nA new contract = a new JSON/YAML in \`governance/contracts/\` + a matching enforcement script. This page regenerates from those.\n`
writeFileSync(join(OUT, 'index.mdx'), idx)

// --- one detail page per contracts/*.json that has a `rules` array ---
const pages = ['index']
for (const f of readdirSync(CDIR)) {
  if (!f.endsWith('.json') || f === 'registry.json') continue
  const c = JSON.parse(readFileSync(join(CDIR, f), 'utf8'))
  if (!Array.isArray(c.rules)) continue
  let p = fm(c.title, c.summary)
  p += `\n# ${c.title} contract\n\n${banner('governance/contracts/' + f)}\n\n${c.summary || ''}\n\n## The rule\n\n`
  c.rules.forEach((r, i) => { p += `${i + 1}. ${r.locked ? '🔒 ' : ''}${r.text}\n` })
  if (c.enforcedBy) p += `\n## Enforced by\n\n\`${c.enforcedBy}\`\n\n`
  if (Array.isArray(c.enforcement)) for (const e of c.enforcement) p += `- ${e}\n`
  if (Array.isArray(c.openItems) && c.openItems.length) {
    p += `\n## Open items (confirm to lock)\n\n`
    for (const o of c.openItems) p += `- ${o}\n`
  }
  writeFileSync(join(OUT, `${c.id}.mdx`), p)
  pages.push(c.id)
}

// --- dependencies page, rendered from the live allowlist ---
const dep = JSON.parse(readFileSync(join(GOV, 'allowed-deps.json'), 'utf8'))
let d = fm('Dependencies', 'Every dependency confirmed, added one page at a time. The allowlist is the source of truth.')
d += `\n# Dependencies contract\n\n${banner('governance/allowed-deps.json')}\n\n`
d += `Every dependency is **confirmed** and added **one page at a time**; the allowlist \`governance/allowed-deps.json\` is the source of truth. **Never** bulk-copied from \`writing-system\`. Enforced by \`governance/scripts/check-deps.mjs\` (npm) and \`governance/scripts/check-python-deps.py\` (Python), run save-hook → pre-commit → CI.\n\n## Allowed today\n`
for (const [ws, list] of Object.entries(dep)) {
  if (ws.startsWith('$')) continue
  d += `\n**${ws}**\n\n`
  for (const x of list) d += `- \`${x}\`\n`
}
writeFileSync(join(OUT, 'dependencies.mdx'), d)
pages.push('dependencies')

// --- nav (real generated pages: index first, then each contract, then dependencies) ---
writeFileSync(join(OUT, 'meta.json'), JSON.stringify({ title: 'Platform Contracts', pages }, null, 2) + '\n')

console.log(`Generated ${pages.length} contract pages -> ${OUT}`)
