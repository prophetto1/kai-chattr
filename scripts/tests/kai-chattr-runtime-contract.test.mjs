import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { KAI_CHATTR_PORTS, PORT_REGISTRY } from '../lib/kai-chattr-dev-ports.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('canonical kai-chattr runtime ports are locked', () => {
  assert.deepEqual(KAI_CHATTR_PORTS, {
    web: 8800,
    api: 8840,
    mcpHttp: 8841,
    mcpSse: 8842,
  });
  assert.equal(PORT_REGISTRY.length, 4);
});

test('root package exposes runtime contract scripts', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const scripts = pkg.scripts ?? {};

  assert.equal(scripts.dev, 'node scripts/dev/start-kai-chattr.mjs');
  assert.equal(scripts['runtime:probe'], 'node scripts/probe-kai-chattr-runtime.mjs');
  assert.equal(scripts['test:runtime-contract'], 'node --test scripts/tests/kai-chattr-runtime-contract.test.mjs');
  assert.equal(scripts['test:port-drift-contract'], 'node --test scripts/tests/kai-chattr-port-drift-contract.test.mjs');
  assert.equal(scripts['test:no-api-session-contract'], 'node --test scripts/tests/kai-chattr-no-api-session-contract.test.mjs');
  assert.equal(scripts['test:no-supabase-contract'], 'node --test scripts/tests/kai-chattr-no-supabase-contract.test.mjs');
  assert.equal(scripts['test:workbench-browser'], 'playwright test tests/e2e/workbench-runtime.spec.ts');
  assert.match(scripts['verify-local'] ?? '', /test:runtime-contract/);
  assert.match(scripts['verify-local'] ?? '', /test:no-supabase-contract/);
});

test('runtime files required by the contract exist', () => {
  for (const rel of [
    'scripts/dev/start-kai-chattr.mjs',
    'scripts/probe-kai-chattr-runtime.mjs',
    'scripts/tests/kai-chattr-runtime-contract.test.mjs',
    'scripts/tests/kai-chattr-port-drift-contract.test.mjs',
    'scripts/tests/kai-chattr-no-api-session-contract.test.mjs',
    'scripts/tests/kai-chattr-no-supabase-contract.test.mjs',
    'services/api/app/runtime_contract.py',
    'services/api/app/factory.py',
    'services/api/tests/test_runtime_contract.py',
  ]) {
    assert.equal(fs.existsSync(path.join(repoRoot, rel)), true, `Missing ${rel}`);
  }
});
