import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: process.env.KAI_CHATTR_E2E_BASE_URL ?? 'http://127.0.0.1:8800',
    trace: 'retain-on-failure',
  },
})
