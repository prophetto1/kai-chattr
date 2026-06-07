import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FORBIDDEN_LEGACY_PORTS } from '../lib/kai-chattr-dev-ports.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const scanRoots = [
  { dir: 'package.json', extensions: /\.json$/i },
  { dir: 'apps/web', extensions: /\.(ts|tsx|js|mjs|json)$/i },
  { dir: 'services/api/app', extensions: /\.(py|toml)$/i },
  { dir: 'services/api/tests', extensions: /\.py$/i },
  { dir: 'scripts', extensions: /\.(mjs|js|ps1|sh|cmd)$/i },
];

const allowlist = new Set([
  path.normalize('services/api/app/config.py'),
  path.normalize('services/api/config.toml'),
  path.normalize('scripts/lib/kai-chattr-dev-ports.mjs'),
  path.normalize('scripts/tests/kai-chattr-port-drift-contract.test.mjs'),
]);

test('runtime surfaces do not depend on legacy chattr ports', () => {
  const violations = [];
  const patterns = FORBIDDEN_LEGACY_PORTS.map((port) => new RegExp(`\\b${port}\\b`));

  for (const abs of collectFiles()) {
    const rel = path.normalize(path.relative(repoRoot, abs));
    if (allowlist.has(rel)) {
      continue;
    }
    const text = fs.readFileSync(abs, 'utf8');
    for (const pattern of patterns) {
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
    const abs = path.join(repoRoot, root.dir);
    if (!fs.existsSync(abs)) {
      continue;
    }
    const stat = fs.statSync(abs);
    if (stat.isFile()) {
      files.push(abs);
      continue;
    }
    walk(abs, root.extensions, files);
  }
  return files;
}

function walk(dir, extensions, out) {
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
