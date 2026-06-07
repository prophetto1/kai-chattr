import { expect, test } from '@playwright/test'

test('workbench loads through the kai-chattr runtime contract', async ({ page, request }) => {
  const token = process.env.KAI_CHATTR_SESSION_TOKEN
  if (!token) {
    throw new Error('KAI_CHATTR_SESSION_TOKEN is required for workbench runtime acceptance')
  }

  await page.goto('/workbench')
  await expect(page.getByText('Board API error')).toHaveCount(0)

  const runtimePorts = await request.get('/api/runtime/ports')
  expect(runtimePorts.status()).toBe(200)
  const ports = await runtimePorts.json()
  expect(ports.ports.frontend.port).toBe(8800)
  expect(ports.ports.api.port).toBe(8840)
  expect(ports.ports.mcp_http.port).toBe(8841)
  expect(ports.ports.mcp_sse.port).toBe(8842)

  const forbiddenCapabilities = await request.get('/api/right-rail/capabilities')
  expect(forbiddenCapabilities.status()).toBe(403)

  const capabilities = await request.get('/api/right-rail/capabilities', {
    headers: { 'X-Session-Token': token },
  })
  expect(capabilities.status()).toBe(200)
  const body = await capabilities.json()
  expect(body.tabs.map((tab: { id: string }) => tab.id)).toEqual([
    'rules',
    'jobs',
    'locked',
    'pins',
  ])
})
