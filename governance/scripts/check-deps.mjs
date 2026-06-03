// Dependency-allowlist gate (npm).
// The allowlist data lives in governance/contracts/architecture.json under allowedDeps.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const architecture = JSON.parse(
  readFileSync(join(ROOT, 'governance/contracts/architecture.json'), 'utf8'),
);
const allow = architecture.allowedDeps ?? {};
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
      console.error(`FAIL ${rel}/package.json: "${dep}" is not in Architecture allowedDeps.`);
      violations++;
    }
  }
}

if (violations) {
  console.error(`\nBLOCKED: ${violations} unapproved dependency(ies). See governance/contracts/architecture.json allowedDeps.`);
  process.exit(1);
}
console.log('OK: All declared npm dependencies are in Architecture allowedDeps.');
