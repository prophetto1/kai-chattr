import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const scanRoots = [
  { dir: 'apps/web/src', extensions: /\.(ts|tsx)$/i },
  { dir: 'services/api/app', extensions: /\.py$/i },
  { dir: 'services/api/tests', extensions: /\.py$/i },
  { dir: 'scripts', extensions: /\.(mjs|js)$/i },
];
const allowlist = new Set([
  path.normalize('scripts/tests/kai-chattr-no-api-session-contract.test.mjs'),
  path.normalize('services/api/tests/test_runtime_contract.py'),
  path.normalize('services/api/tests/test_runtime_health.py'),
]);
const forbidden = [
  /fetch\(["'`]\/api\/session["'`]/,
  /add_api_route\(["'`]\/api\/session["'`]/,
  /router\.(get|post|put|delete)\(["'`]\/api\/session["'`]/,
  /["'`]\/api\/session["'`]\s*,\s*methods=/,
];

test('/api/session is not a browser token or backend route contract', () => {
  const violations = [];
  for (const abs of collectFiles()) {
    const rel = path.normalize(path.relative(repoRoot, abs));
    if (allowlist.has(rel)) {
      continue;
    }
    const text = fs.readFileSync(abs, 'utf8');
    for (const pattern of forbidden) {
      if (pattern.test(text)) {
        violations.push(`${rel} matches ${pattern}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

function collectFiles() {
  const files = [];
  for (const root of scanRoots) {
    walk(path.join(repoRoot, root.dir), root.extensions, files);
  }
  return files;
}

function walk(dir, extensions, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__pycache__' || entry.name === 'dist') {
      continue;
    }
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, extensions, out);
    } else if (extensions.test(entry.name)) {
      out.push(abs);
    }
  }
}
