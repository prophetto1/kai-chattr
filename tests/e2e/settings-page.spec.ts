import { expect, test } from '@playwright/test'

test('settings page renders as a dedicated OpenHands-derived settings surface', async ({ page }) => {
  await page.route('**/api/themes', async (route) => {
    await route.fulfill({
      json: {
        selected_theme: 'night',
        items: [
          {
            id: 'day',
            label: 'Day',
            description: 'Light token palette',
            color_scheme: 'light',
            html_classes: [],
          },
          {
            id: 'night',
            label: 'Night',
            description: 'Default dark token palette',
            color_scheme: 'dark',
            html_classes: ['dark'],
          },
        ],
      },
    })
  })
  await page.route('**/api/settings', async (route) => {
    await route.fulfill({
      json: {
        selected_theme: 'night',
      },
    })
  })
  await page.addInitScript((token) => {
    window.__CHATTR_SESSION_TOKEN__ = token
  }, process.env.KAI_CHATTR_SESSION_TOKEN ?? 'settings-test-token')

  await page.goto('/settings')

  await expect(page).toHaveURL(/\/settings\/user\/account$/)
  await expect(page.getByLabel('Workbench shell rail')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Account/ })).toBeVisible()
  await expect(page.getByRole('tab', { name: /Appearance/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Account' }).first()).toBeVisible()

  await page.getByRole('tab', { name: /Appearance/ }).click()
  await expect(page).toHaveURL(/\/settings\/user\/appearance$/)
  await expect(page.getByRole('heading', { name: 'Appearance' }).first()).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Theme' })).toBeVisible()
  await expect(page.getByText('Theme settings unavailable.')).toHaveCount(0)
})
