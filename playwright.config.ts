import { defineConfig } from '@playwright/test'
const scenario = process.env.LAB_SCENARIO ?? 'redact-shared'
const baseURL = process.env.LAB_BASE_URL
const evidenceName = baseURL ? 'zephyr-live' : scenario
export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: `artifacts/latest/${evidenceName}-playwright.json` }]],
  use: { baseURL: baseURL ?? 'http://localhost:4100', browserName: 'chromium', viewport: { width: 1440, height: 1100 }, trace: 'retain-on-failure' },
  ...(baseURL ? {} : { webServer: { command: `node scripts/serve.mjs ${scenario}`, url: 'http://localhost:4100', reuseExistingServer: false, timeout: 30_000 } }),
})
