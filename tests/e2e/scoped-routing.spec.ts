import { expect, test } from '@playwright/test'

test('workspace repositories route renders a designer-ready scoped placeholder', async ({ page }) => {
  await page.addInitScript((token) => {
    window.__CHATTR_SESSION_TOKEN__ = token
  }, process.env.KAI_CHATTR_SESSION_TOKEN ?? 'scoped-route-test-token')

  await page.goto('/w/acme/repositories')

  await expect(page.getByLabel('Workbench shell rail')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Workspace Repositories' }).first()).toBeVisible()
  await expect(page.getByText('/w/acme/repositories').first()).toBeVisible()
  await expect(page.getByText('Repository launch contract')).toBeVisible()
  await expect(page.getByText('cloud first')).toBeVisible()
})

test('workspace settings route renders the requested scoped section', async ({ page }) => {
  await page.addInitScript((token) => {
    window.__CHATTR_SESSION_TOKEN__ = token
  }, process.env.KAI_CHATTR_SESSION_TOKEN ?? 'scoped-route-test-token')

  await page.goto('/w/acme/settings/workspace/members')

  await expect(page.getByLabel('Workbench shell rail')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Member Settings' }).first()).toBeVisible()
  await expect(page.getByText('/w/acme/settings/workspace/members').first()).toBeVisible()
  await expect(page.getByText('workspace_public_id')).toBeVisible()
  await expect(page.getByText('acme', { exact: true })).toBeVisible()
})

test('workspace settings rejects unknown sections into the canonical default section', async ({ page }) => {
  await page.addInitScript((token) => {
    window.__CHATTR_SESSION_TOKEN__ = token
  }, process.env.KAI_CHATTR_SESSION_TOKEN ?? 'scoped-route-test-token')

  await page.goto('/w/acme/settings/workspace/unknown')

  await expect(page).toHaveURL(/\/w\/acme\/settings\/workspace\/general$/)
  await expect(page.getByRole('heading', { name: 'General Settings' }).first()).toBeVisible()
})
