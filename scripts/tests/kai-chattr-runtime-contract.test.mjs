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
    otelGrpc: 8837,
    otelHttp: 8838,
    jaegerUi: 8886,
  });
  assert.equal(PORT_REGISTRY.length, 7);
});

test('root package exposes runtime contract scripts', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  const scripts = pkg.scripts ?? {};

  assert.equal(scripts.dev, 'node scripts/dev/start-kai-chattr.mjs');
  assert.equal(scripts['runtime:probe'], 'node scripts/probe-kai-chattr-runtime.mjs');
  assert.equal(scripts['observability:local'], 'sops exec-env secrets/dev/auth.yaml "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/run-observability-local.ps1"');
  assert.equal(scripts['observability:local:recreate'], 'sops exec-env secrets/dev/auth.yaml "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/run-observability-local.ps1 -Recreate"');
  assert.equal(scripts['observability:local:stop'], 'powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/stop-observability-local.ps1');
  assert.equal(scripts['observability:canaries'], 'node scripts/observability-local-canaries.mjs');
  assert.equal(scripts['check:npm-deps'], 'node governance/scripts/check-deps.mjs');
  assert.equal(scripts['check:python-deps'], 'python governance/scripts/check-python-deps.py');
  assert.equal(scripts['check:python-requirements-sync'], 'python governance/scripts/check-python-requirements-sync.py');
  assert.equal(scripts['check:deps'], 'pnpm run check:npm-deps && pnpm run check:python-deps && pnpm run check:python-requirements-sync');
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
    'scripts/dev/run-observability-local.ps1',
    'scripts/dev/stop-observability-local.ps1',
    'scripts/observability-local-canaries.mjs',
    'scripts/probe-kai-chattr-runtime.mjs',
    'scripts/tests/kai-chattr-runtime-contract.test.mjs',
    'scripts/tests/kai-chattr-port-drift-contract.test.mjs',
    'scripts/tests/kai-chattr-no-api-session-contract.test.mjs',
    'scripts/tests/kai-chattr-no-supabase-contract.test.mjs',
    'governance/scripts/check-python-deps.py',
    'ops/otel/collector.local.yaml',
    'scripts/dev/check-db-from-env.ps1',
    'scripts/dev/database-env.ps1',
    'scripts/dev/api-uv-env.ps1',
    'scripts/dev/run-alembic-from-env.ps1',
    'scripts/dev/run-api-from-env.ps1',
    'scripts/deploy/sync-fly-secrets.ps1',
    'scripts/deploy/sync-fly-secrets-from-sops.ps1',
    'apps/web/functions/api/[[path]].js',
    'apps/web/functions/observability/[[path]].js',
    'apps/web/functions/uploads/[[path]].js',
    'apps/web/functions/docs/[[path]].js',
    'apps/web/functions/openapi.json.js',
    'apps/web/functions/redoc.js',
    'apps/web/public/_routes.json',
    '.github/workflows/deploy-api.yml',
    '.github/workflows/deploy-web.yml',
    'services/api/app/runtime_contract.py',
    'services/api/app/endpoint_contract.py',
    'services/api/app/pydantic_contracts.py',
    'services/api/app/stores/routing_decisions_db.py',
    'services/api/app/factory.py',
    'services/api/app/asgi.py',
    'services/api/tests/test_observability_contract.py',
    'services/api/tests/test_pydantic_contracts.py',
    'services/api/tests/test_routing_decisions_db.py',
    'services/api/tests/test_runtime_contract.py',
    'services/api/Dockerfile',
    'services/api/fly.dev.toml',
    'services/api/fly.prod.toml',
    'services/api/alembic.ini',
    'services/api/migrations/env.py',
    'services/api/migrations/versions/20260607_0001_create_board_rules.py',
    'services/api/migrations/versions/20260609_0004_create_routing_decisions.py',
  ]) {
    assert.equal(fs.existsSync(path.join(repoRoot, rel)), true, `Missing ${rel}`);
  }
});

test('runtime probe uses decisions as the Board tab id and locks it to the locked category', () => {
  const probe = fs.readFileSync(path.join(repoRoot, 'scripts/probe-kai-chattr-runtime.mjs'), 'utf8');

  assert.match(probe, /const REQUIRED_BOARD_TABS = \['rules', 'jobs', 'decisions', 'pins'\];/);
  assert.match(probe, /const decisionsTab = tabs\.find\(\(tab\) => tab\.id === 'decisions'\);/);
  assert.match(probe, /decisionsTab\?\.category !== 'locked'/);
  assert.doesNotMatch(probe, /for \(const required of \['rules', 'jobs', 'locked', 'pins'\]\)/);
});

test('dev orchestrator pins API uv environment (no repo-local .venv)', () => {
  const startScript = fs.readFileSync(path.join(repoRoot, 'scripts/dev/start-kai-chattr.mjs'), 'utf8');
  const uvEnvHelper = fs.readFileSync(path.join(repoRoot, 'scripts/lib/kai-chattr-api-uv-env.mjs'), 'utf8');

  assert.match(startScript, /kai-chattr-api-uv-env\.mjs/);
  assert.match(startScript, /UV_PROJECT_ENVIRONMENT:\s*kaiChattrApiUvEnvironmentPath\(\)/);
  assert.match(uvEnvHelper, /kai-chattr-services-api/);
  assert.doesNotMatch(startScript, /services\/api\/\.venv/);
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

test('web API client and Pages Function forward user auth sessions', () => {
  const apiClient = fs.readFileSync(path.join(repoRoot, 'apps/web/src/lib/chattr-api.ts'), 'utf8');
  const apiProxy = fs.readFileSync(path.join(repoRoot, 'apps/web/functions/api/[[path]].js'), 'utf8');
  const authProxy = fs.readFileSync(path.join(repoRoot, 'apps/web/functions/auth/[[path]].js'), 'utf8');
  const observabilityProxy = fs.readFileSync(path.join(repoRoot, 'apps/web/functions/observability/[[path]].js'), 'utf8');
  const uploadsProxy = fs.readFileSync(path.join(repoRoot, 'apps/web/functions/uploads/[[path]].js'), 'utf8');
  const docsProxy = fs.readFileSync(path.join(repoRoot, 'apps/web/functions/docs/[[path]].js'), 'utf8');
  const openapiProxy = fs.readFileSync(path.join(repoRoot, 'apps/web/functions/openapi.json.js'), 'utf8');
  const redocProxy = fs.readFileSync(path.join(repoRoot, 'apps/web/functions/redoc.js'), 'utf8');
  const viteConfig = fs.readFileSync(path.join(repoRoot, 'apps/web/vite.config.ts'), 'utf8');
  const routes = JSON.parse(fs.readFileSync(path.join(repoRoot, 'apps/web/public/_routes.json'), 'utf8'));

  assert.match(apiClient, /VITE_KAI_CHATTR_API_ORIGIN/);
  assert.match(apiClient, /function chattrApiUrl/);
  assert.match(apiClient, /fetch\(chattrApiUrl\(path\)/);
  assert.match(apiProxy, /FORWARDS the caller's Authorization/);
  assert.doesNotMatch(apiProxy, /KAI_CHATTR_SESSION_TOKEN/);
  assert.doesNotMatch(apiProxy, /headers\.set\('X-Session-Token'/);
  assert.match(authProxy, /api\/\[\[path\]\]\.js/);
  assert.match(observabilityProxy, /api\/\[\[path\]\]\.js/);
  assert.match(uploadsProxy, /api\/\[\[path\]\]\.js/);
  assert.match(docsProxy, /api\/\[\[path\]\]\.js/);
  assert.match(openapiProxy, /api\/\[\[path\]\]\.js/);
  assert.match(redocProxy, /api\/\[\[path\]\]\.js/);
  assert.match(viteConfig, /'\/auth'/);
  assert.match(viteConfig, /'\/api'/);
  assert.match(viteConfig, /\^\/observability\/\(status\|endpoints\)/);
  assert.match(viteConfig, /'\/uploads'/);
  assert.match(viteConfig, /'\/openapi\.json'/);
  assert.match(viteConfig, /'\/docs'/);
  assert.match(viteConfig, /'\/redoc'/);
  assert.deepEqual(routes, {
    version: 1,
    include: ['/auth/*', '/api/*', '/observability/*', '/uploads/*', '/openapi.json', '/docs', '/docs/*', '/redoc'],
    exclude: [],
  });
});
