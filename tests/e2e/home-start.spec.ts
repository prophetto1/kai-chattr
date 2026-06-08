import { expect, test } from '@playwright/test'

test('home start page renders OpenHands-derived launch surface', async ({ page }) => {
  await page.addInitScript((token) => {
    window.__CHATTR_SESSION_TOKEN__ = token
  }, process.env.KAI_CHATTR_SESSION_TOKEN ?? 'home-test-token')

  await page.goto('/home')

  await expect(page.getByRole('navigation', { name: 'Primary workspace' })).toBeVisible()
  await expect(page.getByText('New around here? Not sure where to start?')).toBeVisible()
  await expect(page.getByRole('heading', { name: "Let's Start Building!" })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Open Repository' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Start from Scratch' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Recent Conversations' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Suggested Tasks' })).toBeVisible()

  await expect(page.getByRole('combobox', { name: 'Repository' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Branch' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Launch' })).toBeDisabled()
  await expect(page.getByText('No recent conversations')).toBeVisible()
  await expect(page.getByText('No tasks available')).toBeVisible()
  await expect(page.getByText('Home API error:')).toHaveCount(0)
})

test('home start page creates a scratch conversation and routes to workbench', async ({ page }) => {
  await page.addInitScript((token) => {
    window.__CHATTR_SESSION_TOKEN__ = token
  }, process.env.KAI_CHATTR_SESSION_TOKEN ?? 'home-test-token')

  await page.goto('/home')

  await page.getByRole('button', { name: 'New Conversation' }).click()
  await page.waitForURL(/\/workbench\?conversation_id=/)
})
