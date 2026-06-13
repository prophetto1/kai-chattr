#!/usr/bin/env node
import {
  KAI_CHATTR_PORTS,
  localApiUrl,
  localWebUrl,
} from './lib/kai-chattr-dev-ports.mjs';

const PROBE_TIMEOUT_MS = 5000;
const REQUIRED_BOARD_TABS = ['rules', 'jobs', 'decisions', 'pins'];

await probeJson(localApiUrl('/api/runtime/ports'), 200, assertRuntimePorts);
await probeJson(localWebUrl('/api/runtime/ports'), 200, assertRuntimePorts);
await probeText(localWebUrl('/workbench'), 200);
await probeJson(localWebUrl('/api/right-rail/capabilities'), 401);

const token = await mintLocalSession();
await probeJson(
  localWebUrl('/api/right-rail/capabilities'),
  200,
  assertBoardCapabilities,
  { Authorization: `Bearer ${token}` },
);
await probeText(localApiUrl('/workbench'), 404, { Authorization: `Bearer ${token}` });
await probeText(localApiUrl('/static/app.js'), 404, { Authorization: `Bearer ${token}` });
await probeText(localApiUrl('/api/session'), 404, { Authorization: `Bearer ${token}` });

console.log('kai-chattr runtime probe passed');

async function mintLocalSession() {
  const body = await probeJson(
    localWebUrl('/auth/local-session'),
    200,
    assertAuthSession,
    {},
    { method: 'POST' },
  );
  return body.token;
}

async function probeJson(url, expectedStatus, assertion, headers = {}, init = {}) {
  const started = Date.now();
  const response = await fetchWithTimeout(url, { ...init, headers });
  logProbe(url, response.status, Date.now() - started);
  if (response.status !== expectedStatus) {
    fail(`${url} returned ${response.status}; expected ${expectedStatus}`);
  }
  const body = await response.json().catch(() => null);
  if (assertion) {
    assertion(body, url);
  }
  return body;
}

async function probeText(url, expectedStatus, headers = {}) {
  const started = Date.now();
  const response = await fetchWithTimeout(url, { headers });
  logProbe(url, response.status, Date.now() - started);
  if (response.status !== expectedStatus) {
    fail(`${url} returned ${response.status}; expected ${expectedStatus}`);
  }
  return response.text();
}

async function fetchWithTimeout(url, init = {}) {
  try {
    return await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`${url} is not reachable (${detail})`);
  }
}

function assertRuntimePorts(body, url) {
  if (!body || typeof body !== 'object') {
    fail(`${url} did not return a JSON object`);
  }
  const ports = body.ports ?? {};
  assertPort(ports.frontend?.port, KAI_CHATTR_PORTS.web, `${url} frontend`);
  assertPort(ports.api?.port, KAI_CHATTR_PORTS.api, `${url} api`);
  assertPort(ports.mcp_http?.port, KAI_CHATTR_PORTS.mcpHttp, `${url} mcp_http`);
  assertPort(ports.mcp_sse?.port, KAI_CHATTR_PORTS.mcpSse, `${url} mcp_sse`);
}

function assertBoardCapabilities(body, url) {
  const tabs = body?.tabs;
  if (!Array.isArray(tabs)) {
    fail(`${url} did not return a tabs array`);
  }
  const ids = new Set(tabs.map((tab) => tab.id));
  for (const required of REQUIRED_BOARD_TABS) {
    if (!ids.has(required)) {
      fail(`${url} did not include Board capability tab: ${required}`);
    }
  }
  const decisionsTab = tabs.find((tab) => tab.id === 'decisions');
  if (decisionsTab?.category !== 'locked') {
    fail(`${url} Board capability tab decisions was not backed by locked category`);
  }
}

function assertAuthSession(body, url) {
  if (!body || typeof body !== 'object' || typeof body.token !== 'string') {
    fail(`${url} did not return an auth session`);
  }
  if (!body.token.startsWith('kcs_')) {
    fail(`${url} did not return a kcs_ auth session`);
  }
}

function assertPort(actual, expected, label) {
  if (actual !== expected) {
    fail(`${label} port is ${actual}; expected ${expected}`);
  }
}

function logProbe(url, status, durationMs) {
  console.log(JSON.stringify({
    event: 'kai_chattr.runtime.probe',
    component: 'runtime-probe',
    path: new URL(url).pathname,
    status,
    duration_ms: durationMs,
  }));
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
