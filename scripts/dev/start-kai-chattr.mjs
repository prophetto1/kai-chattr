#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { KAI_CHATTR_PORTS } from '../lib/kai-chattr-dev-ports.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const apiRoot = path.join(repoRoot, 'services', 'api');
const tokenFromEnv = (process.env.KAI_CHATTR_SESSION_TOKEN ?? '').trim();
const sessionToken = tokenFromEnv || randomBytes(32).toString('hex');
const tokenSource = tokenFromEnv ? 'environment' : 'generated in-memory';
const children = new Set();

logEvent('kai_chattr.runtime.dev_start', {
  component: 'dev-orchestrator',
  token_source: tokenSource,
  has_token: true,
  ports: KAI_CHATTR_PORTS,
});

const childEnv = {
  ...process.env,
  KAI_CHATTR_SESSION_TOKEN: sessionToken,
  VITE_KAI_CHATTR_SESSION_TOKEN: sessionToken,
};

const api = startChild('api', 'uv', ['run', 'python', '-m', 'app.cli'], apiRoot, childEnv);
const web = startChild(
  'web',
  'pnpm',
  ['--dir', 'apps/web', 'run', 'dev'],
  repoRoot,
  childEnv,
);

process.on('SIGINT', () => shutdown(130));
process.on('SIGTERM', () => shutdown(143));

function startChild(label, command, args, cwd, env) {
  const child = spawn(command, args, {
    cwd,
    env,
    shell: process.platform === 'win32',
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  children.add(child);

  child.stdout.on('data', (data) => writeRedacted(process.stdout, label, data));
  child.stderr.on('data', (data) => writeRedacted(process.stderr, label, data));
  child.on('exit', (code, signal) => {
    children.delete(child);
    const exitCode = typeof code === 'number' ? code : signal ? 1 : 0;
    if (children.size > 0) {
      console.error(`[${label}] exited; stopping kai-chattr runtime`);
      shutdown(exitCode || 1);
    }
  });
  child.on('error', (error) => {
    console.error(`[${label}] failed to start: ${error.message}`);
    shutdown(1);
  });

  return child;
}

function shutdown(code) {
  for (const child of children) {
    if (!child.killed) {
      child.kill();
    }
  }
  process.exit(code);
}

function writeRedacted(stream, label, data) {
  const text = String(data).replaceAll(sessionToken, '[redacted-session-token]');
  for (const line of text.split(/\r?\n/)) {
    if (line.length > 0) {
      stream.write(`[${label}] ${line}\n`);
    }
  }
}

function logEvent(event, fields) {
  console.log(JSON.stringify({ event, ...fields }));
}

void api;
void web;
