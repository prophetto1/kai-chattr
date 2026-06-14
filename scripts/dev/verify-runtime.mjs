#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'

import { kaiChattrApiUvEnvironmentPath } from '../lib/kai-chattr-api-uv-env.mjs'
import { KAI_CHATTR_PORTS, localApiUrl, localWebUrl } from '../lib/kai-chattr-dev-ports.mjs'

const token = (process.env.KAI_CHATTR_SESSION_TOKEN ?? '').trim() || randomBytes(32).toString('hex')
const env = {
  ...process.env,
  UV_PROJECT_ENVIRONMENT: kaiChattrApiUvEnvironmentPath(),
  KAI_CHATTR_SESSION_TOKEN: token,
  VITE_KAI_CHATTR_SESSION_TOKEN: token,
}
const children = new Set()

try {
  await assertRuntimePortsFree()

  start('runtime', 'pnpm', ['run', 'dev'], env)

  await waitFor('api runtime ports', localApiUrl('/api/runtime/ports'))
  await waitFor('web workbench', localWebUrl('/workbench'))

  await run('runtime-probe', 'node', ['scripts/probe-kai-chattr-runtime.mjs'], env)
  await run('workbench-browser', 'pnpm', ['run', 'test:workbench-browser'], env)

  shutdown(0)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  shutdown(1)
}

function start(label, command, args, childEnv) {
  const child = spawn(command, args, {
    env: childEnv,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.add(child)
  child.stdout.on('data', (data) => writeRedacted(process.stdout, label, data))
  child.stderr.on('data', (data) => writeRedacted(process.stderr, label, data))
  child.on('exit', () => children.delete(child))
  child.on('error', (error) => {
    throw error
  })
  return child
}

function run(label, command, args, childEnv) {
  return new Promise((resolve, reject) => {
    const child = start(label, command, args, childEnv)
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${label} exited with ${code ?? signal}`))
    })
  })
}

async function waitFor(label, url) {
  const deadline = Date.now() + 45000
  let lastError = ''

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(2500) })
      if (response.ok) {
        return
      }
      lastError = `${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await delay(500)
  }

  throw new Error(`${label} did not become ready at ${url}: ${lastError}`)
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function assertRuntimePortsFree() {
  return Promise.all([
    assertPortFree('web', KAI_CHATTR_PORTS.web),
    assertPortFree('api', KAI_CHATTR_PORTS.api),
    assertPortFree('mcp http', KAI_CHATTR_PORTS.mcpHttp),
    assertPortFree('mcp sse', KAI_CHATTR_PORTS.mcpSse),
  ])
}

function assertPortFree(label, port) {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', () => {
      reject(new Error(`${label} port ${port} is already in use; stop the existing kai-chattr runtime before verify-local`))
    })
    server.listen(port, '127.0.0.1', () => {
      server.close(resolve)
    })
  })
}

function writeRedacted(stream, label, data) {
  const text = String(data).replaceAll(token, '[redacted-session-token]')
  for (const line of text.split(/\r?\n/)) {
    if (line) {
      stream.write(`[${label}] ${line}\n`)
    }
  }
}

function shutdown(code) {
  for (const child of children) {
    killProcessTree(child)
  }
  process.exit(code)
}

function killProcessTree(child) {
  if (child.killed || typeof child.pid !== 'number') {
    return
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    })
    return
  }

  child.kill()
}
