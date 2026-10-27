import { defineConfig } from '@playwright/test'
const scenario = process.env.LAB_SCENARIO ?? 'redact-shared'
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: `artifacts/latest/${scenario}-playwright.json` }]],
  use: { baseURL: 'http://localhost:4100', browserName: 'chromium', viewport: { width: 1440, height: 1100 }, trace: 'retain-on-failure' },
  webServer: { command: `node scripts/serve.mjs ${scenario}`, url: 'http://localhost:4100', reuseExistingServer: false, timeout: 30_000 },
})
