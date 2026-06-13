import { expect, test } from '@playwright/test'

test('workbench loads through the kai-chattr runtime contract', async ({ page, request }) => {
  const session = await request.post('/auth/local-session')
  expect(session.status()).toBe(200)
  const token = (await session.json()).token as string
  expect(token).toMatch(/^kcs_/)

  await page.addInitScript((sessionToken) => {
    window.localStorage.setItem('kai_chattr_session_token', sessionToken)
  }, token)

  await page.goto('/workbench')
  await expect(page.getByText('Board API error')).toHaveCount(0)

  const observabilityStatus = await request.get('/observability/status')
  expect(observabilityStatus.status()).toBe(200)
  const observability = await observabilityStatus.json()
  await expect(page.getByTestId('otel-traces-exporter')).toHaveCount(0)
  await page.getByLabel('Jon account').click()
  await page.getByRole('menuitem', { name: 'Observability' }).click()
  await expect(page).toHaveURL(/\/observability$/)
  await expect(page.getByRole('heading', { name: 'Observability' })).toBeVisible()
  await expect(page.getByText('Runtime telemetry')).toBeVisible()
  await expect(page.getByText('Recent backend spans')).toBeVisible()
  await expect(page.getByText(observability.otel_traces_exporter).first()).toBeVisible()
  await page.goto('/workbench')

  const runtimePorts = await request.get('/api/runtime/ports')
  expect(runtimePorts.status()).toBe(200)
  const ports = await runtimePorts.json()
  expect(ports.ports.frontend.port).toBe(8800)
  expect(ports.ports.api.port).toBe(8840)
  expect(ports.ports.mcp_http.port).toBe(8841)
  expect(ports.ports.mcp_sse.port).toBe(8842)

  const forbiddenCapabilities = await request.get('/api/right-rail/capabilities')
  expect(forbiddenCapabilities.status()).toBe(401)

  const capabilities = await request.get('/api/right-rail/capabilities', {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(capabilities.status()).toBe(200)
  const body = await capabilities.json()
  expect(body.tabs.map((tab: { id: string }) => tab.id)).toEqual([
    'rules',
    'jobs',
    'decisions',
    'pins',
  ])
  expect(Object.fromEntries(body.tabs.map((tab: { id: string; surface: string }) => [
    tab.id,
    tab.surface,
  ]))).toEqual({
    rules: 'board',
    jobs: 'dock',
    decisions: 'board',
    pins: 'board',
  })

  const registeredAgent = await request.post('/api/register', {
    data: { base: 'codex' },
  })
  expect(registeredAgent.status()).toBe(200)
  const registeredAgentBody = await registeredAgent.json()
  const agentName = registeredAgentBody.name as string
  const agentToken = registeredAgentBody.token as string
  const terminalText = `terminal-runtime-${Date.now()}\n$ echo kai-chattr-terminal`
  const terminalSnapshot = await request.post(`/api/terminal/${agentName}`, {
    data: {
      cols: 96,
      rows: 28,
      text: terminalText,
    },
    headers: { Authorization: `Bearer ${agentToken}` },
  })
  expect(terminalSnapshot.status()).toBe(200)

  await page.getByLabel('Terminal').click()
  await expect(page.getByTestId('terminal-tab-list')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Terminal 1' })).toHaveAttribute('aria-selected', 'true')
  await page.getByTestId('new-terminal-button').click()
  await expect(page.getByRole('tab', { name: 'Terminal 2' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('terminal-session-panel')).toHaveCount(2)
  await page.getByRole('tab', { name: 'Terminal 1' }).click()
  await expect(page.getByRole('tab', { name: 'Terminal 1' })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: 'Close Terminal 2' }).click()
  await expect(page.getByRole('tab', { name: 'Terminal 2' })).toHaveCount(0)
  await expect(page.getByTestId('terminal-session-panel')).toHaveCount(1)
  await expect(page.getByTestId('interactive-terminal')).toBeVisible()

  const uniqueText = `@${agentName} runtime-composer-${Date.now()}`
  await page
    .getByPlaceholder('Run task with Claude — type / for commands')
    .fill(uniqueText)
  await page.getByRole('button', { name: 'Submit' }).click()

  await expect.poll(async () => {
    const messages = await request.get('/api/messages?limit=25&channel=general', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(messages.status()).toBe(200)
    const payload = await messages.json()
    return payload.some((message: { text?: string; sender?: string; channel?: string }) =>
      message.text === uniqueText &&
      message.sender === 'user' &&
      message.channel === 'general'
    )
  }).toBe(true)
  await expect(page.getByText(uniqueText)).toBeVisible()

  await expect.poll(async () => {
    const queue = await request.get(`/api/poll/${agentName}`, {
      headers: { Authorization: `Bearer ${agentToken}` },
    })
    expect(queue.status()).toBe(200)
    const payload = await queue.json()
    return (payload.entries as Array<{ sender?: string; text?: string; channel?: string }>).some(
      (entry) =>
        entry.sender === 'user' &&
        entry.text === `user: ${uniqueText}` &&
        entry.channel === 'general'
    )
  }).toBe(true)

  const agentReply = `runtime-agent-reply-${Date.now()}`
  const sentReply = await request.post('/api/send', {
    data: { text: agentReply, channel: 'general' },
    headers: { Authorization: `Bearer ${agentToken}` },
  })
  expect(sentReply.status()).toBe(200)
  const sentReplyBody = await sentReply.json()
  expect(sentReplyBody.sender).toBe(agentName)
  await expect(page.getByText(agentReply)).toBeVisible()
})
