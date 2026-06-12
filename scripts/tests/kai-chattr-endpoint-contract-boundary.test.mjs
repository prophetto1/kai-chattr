// Endpoint-contracts governance: frontend raw-call boundary.
//
// Product code (components/routes/hooks) must consume the contract-bound
// helpers in apps/web/src/lib/*; raw transport usage (chattrJson,
// chattrApiUrl, fetch('/api...')) is allowed ONLY in the API layer and the
// frozen legacy exceptions below. New raw call sites anywhere else fail.
//
// Rule source: governance/contracts/endpoint-contracts.json
// (key: frontend boundary, plan Task 7).

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import test from 'node:test';

const WEB_SRC = join(process.cwd(), 'apps', 'web', 'src');

// The API layer: every module directly under src/lib is transport or a
// per-area contract helper by convention.
const ALLOWED_DIR_PREFIX = 'lib' + sep;

// Transport-adjacent hook (WebSocket URL construction).
const ALLOWED_FILES = new Set(['hooks' + sep + 'use-chattr-room.ts']);

// Frozen legacy debt — existing raw callers grandfathered 2026-06-12.
// Shrink this list; never grow it. Removing an entry once the file is
// migrated keeps the gate honest.
const LEGACY_EXCEPTIONS = new Set([
  'components' + sep + 'workbench' + sep + 'BoardDock.tsx',
  'components' + sep + 'workbench' + sep + 'JobsDock.tsx',
]);

const RAW_PATTERNS = [
  /chattrJson\s*[<(]/,
  /chattrApiUrl\s*\(/,
  /fetch\(\s*['"`]\/api/,
  /fetch\(\s*['"`]\/observability/,
  /fetch\(\s*['"`]\/schemas/,
];

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx)$/.test(name)) {
      yield full;
    }
  }
}

test('no uncontracted frontend api callers outside the allowlist', () => {
  const violations = [];
  for (const file of walk(WEB_SRC)) {
    const rel = relative(WEB_SRC, file);
    if (rel.startsWith(ALLOWED_DIR_PREFIX)) continue;
    if (ALLOWED_FILES.has(rel)) continue;
    if (LEGACY_EXCEPTIONS.has(rel)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (RAW_PATTERNS.some((pattern) => pattern.test(line))) {
        violations.push(`${rel}:${index + 1}: ${line.trim().slice(0, 100)}`);
      }
    });
  }
  assert.deepEqual(
    violations,
    [],
    `Raw API call sites outside the contract boundary (use a lib/*-api helper instead):\n${violations.join('\n')}`
  );
});

test('legacy exceptions still exist (remove stale entries when migrated)', () => {
  const stale = [];
  for (const rel of LEGACY_EXCEPTIONS) {
    const file = join(WEB_SRC, rel);
    let hasRaw = false;
    try {
      const content = readFileSync(file, 'utf8');
      hasRaw = RAW_PATTERNS.some((pattern) => pattern.test(content));
    } catch {
      stale.push(`${rel} (file missing)`);
      continue;
    }
    if (!hasRaw) stale.push(`${rel} (no raw calls left — delete its exception)`);
  }
  assert.deepEqual(stale, [], `Stale legacy exceptions:\n${stale.join('\n')}`);
});
