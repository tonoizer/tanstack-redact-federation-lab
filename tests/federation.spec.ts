import { test, expect } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const scenario = process.env.LAB_SCENARIO ?? 'redact-shared'
const naive = scenario === 'redact-naive'
const live = !!process.env.LAB_BASE_URL
const evidenceName = live ? 'zephyr-live' : scenario
const remotes: Record<string, string> = live
  ? JSON.parse(readFileSync('deployments/zephyr.json', 'utf8')).hostRemotes
  : Object.fromEntries(['counter', 'context', 'portal'].map((name, i) => [name, `http://localhost:${4101 + i}/remoteEntry.js`]))

test('Start serves real HTML and hydration preserves the server DOM node', async ({ page, request }) => {
  const response = await request.get('/')
  expect(response.status()).toBe(200)
  const html = await response.text()
  expect(html).toContain('The shared source of truth.')
  expect(html).not.toContain('data-testid="local-count"')
  await page.goto('/')
  await page.getByRole('button', { name: 'Host count:' }).click()
  await expect(page.getByTestId('host-count')).toHaveText('1')
  expect(await page.evaluate(() => (window as any).__SSR_ELEMENT__ === document.querySelector('[data-testid="ssr-probe"]'))).toBe(true)
})

test('federation loads three real HTTP remote entries and exposes runtime identity', async ({ page }) => {
  const entries = new Set<string>()
  page.on('response', response => {
    if (response.url().endsWith('/remoteEntry.js') && response.ok()) entries.add(new URL(response.url()).origin)
  })
  await page.goto('/')
  await expect(page.getByTestId('identity-counter-useState')).toHaveText(naive ? 'FAIL' : 'PASS')
  await expect(page.getByTestId('identity-context-useState')).toHaveText(naive ? 'FAIL' : 'PASS')
  await expect(page.getByTestId('identity-portal-useState')).toHaveText(naive ? 'FAIL' : 'PASS')
  expect([...entries].sort()).toEqual(Object.values(remotes).map(url => new URL(url).origin).sort())
  for (const name of ['counter', 'context', 'portal']) {
    await expect(page.getByTestId(`identity-${name}-contextObject`)).toHaveText('PASS')
  }
  const evidence = { scenario, hostURL: page.url(), testedAt: new Date().toISOString(), node: process.version, browser: page.context().browser()?.version(),
    remoteOrigins: [...entries].sort(), identity: await page.locator('tbody').innerText(),
    renderedErrors: await page.locator('[data-testid$="-error"]').allTextContents() }
  mkdirSync('artifacts/latest', { recursive: true })
  writeFileSync(`artifacts/latest/${evidenceName}-identity.json`, JSON.stringify(evidence, null, 2) + '\n')
})

test('hooks, host context, remote callbacks, portals and remounts work across boundaries', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto('/')
  await expect(page.getByTestId('identity-status')).toHaveText(naive ? 'Runtime identity mismatch' : 'Same runtime across all remotes')
  await expect(page.getByTestId('effect')).toHaveText('mounted')
  await page.getByRole('button', { name: 'Increment local', exact: true }).click()
  await page.getByRole('button', { name: 'Increment local', exact: true }).click()
  await expect(page.getByTestId('local-count')).toHaveText('2')
  await page.getByRole('button', { name: 'Increment host', exact: true }).click()
  await expect(page.getByTestId('host-count')).toHaveText('1')
  await expect(page.getByTestId('context-count')).toHaveText('1')
  await page.getByLabel('Provider message').fill('Updated across federation boundaries')
  await expect(page.getByTestId('context-message')).toHaveText('Updated across federation boundaries')
  await page.getByRole('button', { name: 'Update from context remote' }).click()
  await expect(page.getByTestId('counter-host-count')).toHaveText('2')
  await page.getByRole('button', { name: 'Open remote portal' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.getByRole('dialog').evaluate(element => element.parentElement === document.body)).toBe(true)
  await expect(page.getByTestId('portal-count')).toHaveText('2')
  await page.getByRole('button', { name: 'Increment inside portal' }).click()
  await expect(page.getByTestId('host-count')).toHaveText('3')
  await expect(page.getByTestId('context-count')).toHaveText('3')
  await page.getByRole('button', { name: 'Close portal' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: 'Unmount remotes' }).click()
  await expect(page.getByTestId('counter')).toHaveCount(0)
  await page.getByRole('button', { name: 'Mount remotes' }).click()
  await expect(page.getByTestId('local-count')).toHaveText('0')
  await expect(page.getByTestId('effect')).toHaveText('mounted')
  await expect(page.getByTestId('context-count')).toHaveText('3')
  expect(errors).toEqual([])
  await page.screenshot({ path: `artifacts/latest/${evidenceName}-desktop.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: `artifacts/latest/${evidenceName}-mobile.png`, fullPage: true })
})

test('Suspense fallback remains visible while a remote HTTP request is delayed', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route(remotes.counter, async route => { await gate; await route.continue() })
  await page.goto('/')
  await expect(page.getByTestId('counter-loading')).toBeVisible()
  await expect(page.getByTestId('context')).toBeVisible()
  release()
  await expect(page.getByTestId('counter')).toBeVisible()
})

test('a failed remote is contained and the other two remain interactive', async ({ page }) => {
  await page.route(remotes.counter, route => route.abort())
  await page.goto('/')
  await expect(page.getByTestId('counter-error')).toBeVisible()
  await expect(page.getByTestId('identity-status')).toHaveText('Remote load failed: counter')
  await expect(page.getByTestId('context')).toBeVisible()
  await page.getByRole('button', { name: 'Update from context remote' }).click()
  await expect(page.getByTestId('context-count')).toHaveText('1')
  await page.getByRole('button', { name: 'Open remote portal' }).click()
  await expect(page.getByTestId('portal-count')).toHaveText('1')
})

test('default aliases produce distinct exports even when the tested interactions work', async ({ page }) => {
  test.skip(!naive, 'Only the default-alias comparison has distinct function exports.')
  await page.goto('/')
  await expect(page.getByTestId('identity-status')).toHaveText('Runtime identity mismatch')
  for (const name of ['counter', 'context', 'portal']) await expect(page.getByTestId(name)).toBeVisible()
  await page.screenshot({ path: `artifacts/latest/${scenario}-desktop.png`, fullPage: true })
})
