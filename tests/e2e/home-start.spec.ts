import { expect, test, type Page } from '@playwright/test'

async function mockHomeStartApi(page: Page) {
  await page.route('**/api/repositories', async (route) => {
    await route.fulfill({
      json: {
        items: [],
        next_page_id: null,
      },
    })
  })
  await page.route('**/api/conversations/recent', async (route) => {
    await route.fulfill({
      json: {
        items: [],
        next_page_id: null,
      },
    })
  })
  await page.route('**/api/suggested-tasks', async (route) => {
    await route.fulfill({
      json: {
        items: [],
        next_page_id: null,
      },
    })
  })
  await page.route('**/api/conversations', async (route) => {
    expect(route.request().method()).toBe('POST')
    await route.fulfill({
      json: {
        conversation_id: 'scratch-test-conversation',
        status: 'created',
        url: '/workbench?conversation_id=scratch-test-conversation',
        conversation: {
          id: 'scratch-test-conversation',
          title: 'Scratch conversation',
          selected_repository: null,
          selected_branch: null,
          git_provider: null,
          status: 'active',
          url: '/workbench?conversation_id=scratch-test-conversation',
          created_at: '2026-06-08T00:00:00Z',
          updated_at: '2026-06-08T00:00:00Z',
        },
      },
    })
  })
}

test('home start page renders OpenHands-derived launch surface', async ({ page }) => {
  await mockHomeStartApi(page)
  await page.addInitScript((token) => {
    window.__CHATTR_SESSION_TOKEN__ = token
  }, process.env.KAI_CHATTR_SESSION_TOKEN ?? 'home-test-token')

  await page.goto('/home')

  await expect(page.getByLabel('Workbench shell rail')).toBeVisible()
  await expect(page.getByRole('heading', { name: "Let's Start Building!" })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Open Repository' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Start from Scratch' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Design an Agent' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Open a Local Repository' })).toBeVisible()
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
  await mockHomeStartApi(page)
  await page.addInitScript((token) => {
    window.__CHATTR_SESSION_TOKEN__ = token
  }, process.env.KAI_CHATTR_SESSION_TOKEN ?? 'home-test-token')

  await page.goto('/home')

  await page.getByRole('button', { name: 'New Conversation' }).click()
  await page.waitForURL(/\/workbench\?conversation_id=/)
})
