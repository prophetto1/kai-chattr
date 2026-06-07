import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const scanRoots = [
  { dir: 'apps/web/src', extensions: /\.(ts|tsx|js|mjs)$/i },
  { dir: 'services/api/app', extensions: /\.py$/i },
  { dir: 'services/api/config.toml', extensions: /\.toml$/i },
  { dir: 'services/api/pyproject.toml', extensions: /\.toml$/i },
  { dir: 'scripts', extensions: /\.(mjs|js|ps1|sh|cmd)$/i },
];
const allowlist = new Set([
  path.normalize('scripts/tests/kai-chattr-no-supabase-contract.test.mjs'),
  path.normalize('scripts/tests/kai-chattr-runtime-contract.test.mjs'),
]);
const forbidden = [
  /@supabase\//i,
  /supabase[-_a-z0-9]*/i,
  /VITE_SUPABASE/i,
  /SUPABASE_/,
];

test('kai-chattr runtime surfaces do not import Supabase stack assumptions', () => {
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

test('package manifests do not declare Supabase dependencies', () => {
  const violations = [];
  for (const rel of ['package.json', 'apps/web/package.json']) {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      for (const name of Object.keys(pkg[section] ?? {})) {
        if (/supabase/i.test(name)) {
          violations.push(`${rel} ${section}.${name}`);
        }
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
    if (fs.statSync(abs).isFile()) {
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
