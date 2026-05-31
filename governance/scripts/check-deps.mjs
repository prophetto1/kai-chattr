// Dependency-allowlist gate (npm). Deterministic JSON comparison — no regex, no AST.
// Fails (exit 1) if any package.json declares a dependency not present in
// governance/allowed-deps.json (under its workspace key, "shared", or "tooling").
//
// Mechanizes the "every dependency must be confirmed" rule: an unapproved dep
// cannot pass save-hook / pre-commit / CI until it is added to the allowlist.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const allow = JSON.parse(readFileSync(join(ROOT, 'governance/allowed-deps.json'), 'utf8'));
const always = new Set([...(allow.shared ?? []), ...(allow.tooling ?? [])]);

function pkgDirs() {
  const dirs = [ROOT];
  for (const group of ['apps', 'services', 'packages']) {
    const base = join(ROOT, group);
    if (!existsSync(base)) continue;
    for (const name of readdirSync(base)) {
      const d = join(base, name);
      if (statSync(d).isDirectory() && existsSync(join(d, 'package.json'))) dirs.push(d);
    }
  }
  return dirs;
}

let violations = 0;
for (const dir of pkgDirs()) {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) continue;
  const rel = relative(ROOT, dir).replaceAll('\\', '/') || '.';
  let pkg;
  try { pkg = JSON.parse(readFileSync(pkgPath, 'utf8')); } catch { continue; }
  const declared = Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) });
  const allowedHere = new Set([...always, ...(allow[rel] ?? [])]);
  for (const dep of declared) {
    if (!allowedHere.has(dep)) {
      console.error(`✗ ${rel}/package.json: "${dep}" is NOT in the allowlist. Confirm it with Jon and add it to governance/allowed-deps.json.`);
      violations++;
    }
  }
}

if (violations) {
  console.error(`\nBLOCKED: ${violations} unapproved dependency(ies). See governance/allowed-deps.json.`);
  process.exit(1);
}
console.log('✓ All declared npm dependencies are on the allowlist.');
