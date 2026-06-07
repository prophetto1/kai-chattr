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
  assert.match(scripts['verify-local'] ?? '', /node scripts\/dev\/verify-runtime\.mjs/);
  assert.equal(scripts['neon:dev:db:status'], 'sops exec-env secrets/dev/neon.yaml "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-db-from-env.ps1 -Environment dev"');
  assert.equal(scripts['neon:dev:migrate'], 'sops exec-env secrets/dev/neon.yaml "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/run-alembic-from-env.ps1 -Environment dev upgrade head"');
  assert.equal(scripts['neon:dev:api'], 'sops exec-env secrets/dev/neon.yaml "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/run-api-from-env.ps1 -Environment dev"');
  assert.equal(scripts['neon:prod:db:status'], 'sops exec-env secrets/dev/neon.yaml "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-db-from-env.ps1 -Environment prod"');
  assert.equal(scripts['neon:prod:migrate'], 'sops exec-env secrets/dev/neon.yaml "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/run-alembic-from-env.ps1 -Environment prod upgrade head"');
  assert.equal(scripts['fly:dev:secrets'], 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy/sync-fly-secrets-from-sops.ps1 -Environment dev');
  assert.equal(scripts['fly:prod:secrets'], 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/deploy/sync-fly-secrets-from-sops.ps1 -Environment prod');
  assert.equal(scripts['local:postgres:start'], undefined);
  assert.equal(scripts['local:api:migrate'], undefined);
  assert.match(scripts['verify-local'] ?? '', /test:runtime-contract/);
  assert.match(scripts['verify-local'] ?? '', /test:no-supabase-contract/);
});

test('runtime files required by the contract exist', () => {
  for (const rel of [
    'scripts/dev/start-kai-chattr.mjs',
    'scripts/dev/verify-runtime.mjs',
    'scripts/probe-kai-chattr-runtime.mjs',
    'scripts/tests/kai-chattr-runtime-contract.test.mjs',
    'scripts/tests/kai-chattr-port-drift-contract.test.mjs',
    'scripts/tests/kai-chattr-no-api-session-contract.test.mjs',
    'scripts/tests/kai-chattr-no-supabase-contract.test.mjs',
    'scripts/dev/check-db-from-env.ps1',
    'scripts/dev/database-env.ps1',
    'scripts/dev/run-alembic-from-env.ps1',
    'scripts/dev/run-api-from-env.ps1',
    'scripts/deploy/sync-fly-secrets.ps1',
    'scripts/deploy/sync-fly-secrets-from-sops.ps1',
    'apps/web/functions/api/[[path]].js',
    'apps/web/public/_routes.json',
    '.github/workflows/deploy-api.yml',
    '.github/workflows/deploy-web.yml',
    'services/api/app/runtime_contract.py',
    'services/api/app/factory.py',
    'services/api/app/asgi.py',
    'services/api/tests/test_runtime_contract.py',
    'services/api/Dockerfile',
    'services/api/fly.dev.toml',
    'services/api/fly.prod.toml',
    'services/api/alembic.ini',
    'services/api/migrations/env.py',
    'services/api/migrations/versions/20260607_0001_create_board_rules.py',
  ]) {
    assert.equal(fs.existsSync(path.join(repoRoot, rel)), true, `Missing ${rel}`);
  }
});

test('deploy workflows map branches without browser-exposed session tokens', () => {
  const webWorkflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/deploy-web.yml'), 'utf8');
  const apiWorkflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/deploy-api.yml'), 'utf8');
  const flySecrets = fs.readFileSync(path.join(repoRoot, 'scripts/deploy/sync-fly-secrets.ps1'), 'utf8');

  assert.match(webWorkflow, /workingDirectory: apps\/web/);
  assert.match(webWorkflow, /pages deploy dist --project-name=kai-chattr --branch=\$\{\{ github\.ref_name \}\}/);
  assert.doesNotMatch(webWorkflow, /VITE_KAI_CHATTR_API_ORIGIN/);
  assert.doesNotMatch(webWorkflow, /VITE_KAI_CHATTR_SESSION_TOKEN/);
  assert.match(apiWorkflow, /services\/api\/fly\.prod\.toml/);
  assert.match(apiWorkflow, /services\/api\/fly\.dev\.toml/);
  assert.match(apiWorkflow, /FLY_API_TOKEN: \$\{\{ secrets\.FLY_API_TOKEN \}\}/);
  assert.match(flySecrets, /Missing KAI_CHATTR_SESSION_TOKEN/);
  assert.doesNotMatch(flySecrets, /RandomNumberGenerator/);
});

test('web API client and Pages Function keep hosted API auth server-side', () => {
  const apiClient = fs.readFileSync(path.join(repoRoot, 'apps/web/src/lib/chattr-api.ts'), 'utf8');
  const apiProxy = fs.readFileSync(path.join(repoRoot, 'apps/web/functions/api/[[path]].js'), 'utf8');
  const routes = JSON.parse(fs.readFileSync(path.join(repoRoot, 'apps/web/public/_routes.json'), 'utf8'));

  assert.match(apiClient, /VITE_KAI_CHATTR_API_ORIGIN/);
  assert.match(apiClient, /function chattrApiUrl/);
  assert.match(apiClient, /fetch\(chattrApiUrl\(path\)/);
  assert.match(apiProxy, /KAI_CHATTR_SESSION_TOKEN/);
  assert.match(apiProxy, /headers\.set\('X-Session-Token', token\)/);
  assert.deepEqual(routes, {
    version: 1,
    include: ['/api/*'],
    exclude: [],
  });
});
