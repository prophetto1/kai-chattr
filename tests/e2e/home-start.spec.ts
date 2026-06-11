import { expect, test, type Page } from '@playwright/test'

async function mockHomeStartApi(page: Page) {
  await page.route('**/api/git/repositories/search**', async (route) => {
    const url = new URL(route.request().url())
    expect(url.searchParams.get('provider')).toBe('github')
    await route.fulfill({
      json: {
        items: [
          {
            id: 'github:propreheto/kai-chattr',
            full_name: 'propreheto/kai-chattr',
            git_provider: 'github',
            is_public: false,
            main_branch: 'main',
          },
        ],
        next_page_id: null,
      },
    })
  })
  await page.route('**/api/git/branches/search**', async (route) => {
    const url = new URL(route.request().url())
    expect(url.searchParams.get('provider')).toBe('github')
    expect(url.searchParams.get('repository')).toBe('propreheto/kai-chattr')
    await route.fulfill({
      json: {
        items: [
          {
            name: 'main',
            commit_sha: 'abc123',
            protected: true,
            last_push_date: '2026-06-11T00:00:00Z',
          },
        ],
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
    const body = route.request().postDataJSON() as {
      repository?: {
        name?: string
        branch?: string
        gitProvider?: string
      }
    }
    const conversationId = body.repository
      ? 'repo-test-conversation'
      : 'scratch-test-conversation'
    await route.fulfill({
      json: {
        conversation_id: conversationId,
        status: 'created',
        url: `/w/local/sessions/${conversationId}`,
        conversation: {
          id: conversationId,
          title: body.repository?.name ?? 'Scratch conversation',
          selected_repository: body.repository?.name ?? null,
          selected_branch: body.repository?.branch ?? null,
          git_provider: body.repository?.gitProvider ?? null,
          status: 'active',
          url: `/w/local/sessions/${conversationId}`,
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

  await expect(page.getByRole('combobox', { name: 'Repository' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Git provider' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Launch' })).toBeDisabled()
  await expect(page.getByText('Home API error:')).toHaveCount(0)
})

test('home start page creates a scratch conversation and routes to scoped session', async ({ page }) => {
  await mockHomeStartApi(page)
  await page.addInitScript((token) => {
    window.__CHATTR_SESSION_TOKEN__ = token
  }, process.env.KAI_CHATTR_SESSION_TOKEN ?? 'home-test-token')

  await page.goto('/home')

  await page.getByRole('button', { name: 'New Conversation' }).click()
  await page.waitForURL(/\/w\/local\/sessions\/scratch-test-conversation$/)
})

test('home start page launches a cloud repository session with provider and branch', async ({ page }) => {
  await mockHomeStartApi(page)
  await page.addInitScript((token) => {
    window.__CHATTR_SESSION_TOKEN__ = token
  }, process.env.KAI_CHATTR_SESSION_TOKEN ?? 'home-test-token')

  await page.goto('/home')

  await page.getByRole('combobox', { name: 'Repository' }).click()
  await page.getByRole('option', { name: 'propreheto/kai-chattr' }).click()
  await page.getByRole('combobox', { name: 'Branch' }).click()
  await page.getByRole('option', { name: 'main' }).click()

  const conversationRequest = page.waitForRequest((request) => (
    request.url().endsWith('/api/conversations') &&
    request.method() === 'POST' &&
    request.postDataJSON()?.repository?.gitProvider === 'github'
  ))

  await page.getByRole('button', { name: 'Launch' }).click()
  await conversationRequest
  await page.waitForURL(/\/w\/local\/sessions\/repo-test-conversation$/)
})
