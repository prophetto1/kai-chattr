#!/usr/bin/env node
/**
 * Generates the Fumadocs contract view from governance source files.
 * Do not hand-edit apps/devdocs/content/contracts/*.mdx.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const ROOT = join(here, '..', '..')
const GOV = join(ROOT, 'governance')
const CDIR = join(GOV, 'contracts')
const OUT = join(ROOT, 'apps', 'devdocs', 'content', 'contracts')

mkdirSync(OUT, { recursive: true })
for (const f of readdirSync(OUT)) {
  if (f.endsWith('.mdx') || f === 'meta.json') unlinkSync(join(OUT, f))
}

const STATUS = { locked: 'locked', drafting: 'drafting', planned: 'planned', elsewhere: 'elsewhere' }
const banner = (src) =>
  `{/* GENERATED from ${src} by governance/scripts/build-contract-docs.mjs - do not edit by hand. */}`
const yamlStr = (s) => JSON.stringify(String(s ?? '').replace(/\n/g, ' '))
const fm = (title, description) =>
  `---\ntitle: ${yamlStr(title)}\ndescription: ${yamlStr(description)}\n---\n`
const titleCase = (s) =>
  String(s)
    .replace(/[-_/]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())

const reg = JSON.parse(readFileSync(join(CDIR, 'registry.json'), 'utf8'))
const pages = reg.categories
  .flatMap((cat) => cat.contracts)
  .filter((entry) => entry.page && entry.id !== 'dependencies')
  .map((entry) => entry.id)

for (const id of pages) {
  const f = `${id}.json`
  const c = JSON.parse(readFileSync(join(CDIR, f), 'utf8'))
  if (!Array.isArray(c.rules)) continue

  let p = fm(c.title, c.summary)
  p += `\n${banner('governance/contracts/' + f)}\n\n${c.summary || ''}\n\n`

  if (Array.isArray(c.sections) && c.sections.length) {
    p += `## Sections\n\n`
    for (const s of c.sections) {
      const covers = Array.isArray(s.covers) ? s.covers.join(', ') : ''
      p += `- **${s.name}:** ${covers}\n`
    }
    p += `\n`
  }

  if (c.stack && typeof c.stack === 'object') {
    p += `## Stack\n\n`
    for (const [key, value] of Object.entries(c.stack)) {
      p += `### ${key}\n\n`
      if (value.summary) p += `${value.summary}\n\n`
      if (value.runtime) p += `- **Runtime:** ${value.runtime}\n`
      if (Array.isArray(value.items) && value.items.length) {
        p += `- **Items:** ${value.items.join(', ')}\n`
      }
      p += `\n`
    }
  }

  if (c.allowedDeps && typeof c.allowedDeps === 'object') {
    p += `## Dependency Allowlist\n\n`
    for (const [scope, deps] of Object.entries(c.allowedDeps)) {
      if (!Array.isArray(deps)) continue
      p += `### ${titleCase(scope)}\n\n`
      if (deps.length === 0) {
        p += `No dependencies listed.\n\n`
      } else {
        for (const dep of deps) p += `- \`${dep}\`\n`
        p += `\n`
      }
    }
  }

  p += `## Rules\n\n`
  if (c.rules.length === 0) {
    p += `No rules drafted yet.\n`
  } else {
    c.rules.forEach((r, i) => {
      p += `${i + 1}. ${r.locked ? '[locked] ' : ''}${r.text}\n`
    })
  }

  if (c.enforcedBy) p += `\n## Enforced by\n\n\`${c.enforcedBy}\`\n\n`
  if (Array.isArray(c.enforcement)) {
    for (const e of c.enforcement) p += `- ${e}\n`
  }
  if (Array.isArray(c.openItems) && c.openItems.length) {
    p += `\n## Open items\n\n`
    for (const o of c.openItems) p += `- ${o}\n`
  }

  writeFileSync(join(OUT, `${c.id}.mdx`), p)
}

writeFileSync(
  join(OUT, 'meta.json'),
  JSON.stringify({ title: 'Contracts', root: true, defaultOpen: true, pages }, null, 2) + '\n',
)

console.log(`Generated ${pages.length} contract pages -> ${OUT}`)
