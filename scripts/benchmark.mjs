import { chromium } from '@playwright/test'
import { execFileSync, fork } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { cpus, platform, release } from 'node:os'
import { join, relative } from 'node:path'
import { gzipSync, brotliCompressSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import scenarios from '../shared/scenarios.json' with { type: 'json' }

const rounds = Number(process.env.LAB_BENCH_ROUNDS ?? 9)
if (!Number.isInteger(rounds) || rounds < 3 || rounds > 50) throw new Error('LAB_BENCH_ROUNDS must be 3–50')
const profiles = [
  { name: 'loopback', cpuRate: 1, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
  { name: 'constrained', cpuRate: 4, latency: 40, downloadThroughput: 1_250_000, uploadThroughput: 625_000 },
]
const browser = await chromium.launch()
const runs = []
const startedAt = new Date().toISOString()

async function sample(scenario, profile, round) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, serviceWorkers: 'block' })
  try {
    const page = await context.newPage()
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: profile.latency, downloadThroughput: profile.downloadThroughput, uploadThroughput: profile.uploadThroughput })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuRate })
    const requests = new Map()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    cdp.on('Network.responseReceived', event => {
      if (!event.response.url.startsWith('http://localhost:')) return
      const url = new URL(event.response.url)
      requests.set(event.requestId, { url: event.response.url, app: ['host', 'counter', 'context', 'portal'][Number(url.port) - 4100],
        path: url.pathname, type: event.type, status: event.response.status,
        gzip: event.response.headers['Content-Encoding'] === 'gzip' || event.response.headers['content-encoding'] === 'gzip' })
    })
    cdp.on('Network.loadingFinished', event => { const request = requests.get(event.requestId); if (request) request.transferBytes = event.encodedDataLength })
    await page.addInitScript(() => {
      window.__bench = { longTasks: [], readyMs: null }
      new PerformanceObserver(list => { for (const entry of list.getEntries()) window.__bench.longTasks.push(entry.duration) }).observe({ type: 'longtask', buffered: true })
      const check = () => {
        if (['counter', 'context', 'portal'].every(name => document.querySelector(`[data-testid="${name}"]`)) && document.querySelector('[data-testid="effect"]')?.textContent === 'mounted') {
          window.__bench.readyMs = performance.now()
        } else requestAnimationFrame(check)
      }
      requestAnimationFrame(check)
    })
    await page.goto('http://localhost:4100/?bench=1', { waitUntil: 'domcontentloaded' })
    if (await page.getByTestId('scenario').textContent() !== scenario) throw new Error('Server served the wrong build')
    await page.waitForFunction(() => window.__bench.readyMs !== null)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForLoadState('networkidle')
    const initialRequests = [...requests.values()].map(r => ({ ...r }))
    const timing = await page.evaluate(() => ({
      remoteReadyMs: window.__bench.readyMs,
      fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      longTaskCount: window.__bench.longTasks.length,
      longTaskMs: window.__bench.longTasks.reduce((sum, value) => sum + value, 0),
    }))
    const updateMs = await page.evaluate(async () => {
      const button = [...document.querySelectorAll('button')].find(el => el.textContent === 'Update from context remote')
      const samples = []
      for (let i = 0; i < 12; i++) {
        const start = performance.now()
        button.click()
        await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))
        if (document.querySelector('[data-testid="counter-host-count"]').textContent !== String(i + 1)) throw new Error('Cross-remote update failed')
        samples.push(performance.now() - start)
      }
      return samples
    })
    await page.getByRole('button', { name: 'Open remote portal' }).click()
    await page.getByRole('dialog').waitFor()
    if (await page.getByTestId('portal-count').textContent() !== '12') throw new Error('Portal lost shared context')
    const initialJS = initialRequests.filter(r => r.type === 'Script' || r.type === 'Stylesheet')
    if (initialJS.some(r => !r.gzip || !r.transferBytes || r.status !== 200)) throw new Error('Incomplete or uncompressed JS/CSS transfer measurement')
    if (errors.length) throw new Error(errors.join('\n'))
    return { scenario, profile: profile.name, round, ...timing, updateMs,
      jsCssTransferBytes: initialJS.reduce((sum, r) => sum + r.transferBytes, 0),
      jsCssRequests: initialJS.length,
      allResourceTransferBytes: initialRequests.reduce((sum, r) => sum + (r.transferBytes ?? 0), 0),
      requests: initialRequests }
  } finally { await context.close() }
}

// Rotate order per round to spread CPU/thermal drift over the variants.
// Each sample gets fresh browser and server processes; OS/filesystem caches are shared.
try {
  for (const profile of profiles) {
    for (let round = 0; round < rounds; round++) {
      const order = [...scenarios.slice(round % scenarios.length), ...scenarios.slice(0, round % scenarios.length)]
      for (const scenario of order) {
        const close = await startServer(scenario)
        try {
          console.log(`${profile.name} ${round + 1}/${rounds}: ${scenario}`)
          runs.push(await sample(scenario, profile, round + 1))
        } finally { await close() }
      }
    }
  }
} finally { await browser.close() }

function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const q = p => { const index = (sorted.length - 1) * p; const low = Math.floor(index); return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low) }
  return { min: sorted[0], p25: q(.25), median: q(.5), p75: q(.75), max: sorted.at(-1) }
}
const summary = profiles.flatMap(profile => scenarios.map(scenario => {
  const samples = runs.filter(run => run.scenario === scenario && run.profile === profile.name)
  return { scenario, profile: profile.name, runs: samples.length,
    remoteReadyMs: distribution(samples.map(s => s.remoteReadyMs)),
    fcpMs: distribution(samples.map(s => s.fcpMs).filter(value => value !== null)),
    updateMs: distribution(samples.flatMap(s => s.updateMs)),
    jsCssTransferBytes: distribution(samples.map(s => s.jsCssTransferBytes)),
    jsCssRequests: distribution(samples.map(s => s.jsCssRequests)),
    allResourceTransferBytes: distribution(samples.map(s => s.allResourceTransferBytes)),
    longTaskMs: distribution(samples.map(s => s.longTaskMs)),
  }
}))
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)]) }
const builds = scenarios.map(scenario => ({ scenario, apps: ['host', 'counter', 'context', 'portal'].map(app => {
  const root = `dist/${scenario}/${app}${app === 'host' ? '/client' : ''}`
  const entries = files(root).filter(path => /\.(js|css)$/.test(path)).map(path => {
    const bytes = readFileSync(path)
    return { path: relative(root, path).replaceAll('\\', '/'), sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, gzipBytes: gzipSync(bytes).length, brotliBytes: brotliCompressSync(bytes).length }
  })
  return { app, gzipBytes: entries.reduce((sum, entry) => sum + entry.gzipBytes, 0), brotliBytes: entries.reduce((sum, entry) => sum + entry.brotliBytes, 0), files: entries }
}) }))
const result = { schemaVersion: 1, startedAt, completedAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  environment: { node: process.version, chromium: browser.version(), os: `${platform()} ${release()}`, cpu: cpus()[0].model, logicalCpus: cpus().length },
  methodology: {
    rounds, profiles, browser: 'Fresh Chromium context per sample; cache disabled; service workers blocked; gzip HTTP loopback server for every variant.',
    order: 'Scenario order rotates by round; no discarded warmups; each sample starts a fresh server child process. OS/filesystem cache is shared. Cold refers to browser cache, not cold OS/disk/edge.',
    readiness: 'performance.now() at first animation frame with all three remote DOM nodes and the counter effect mounted; excludes Playwright wait overhead.',
    interaction: '12 programmatic context-remote button clicks per page, each followed by two animation frames and sibling DOM validation; includes frame scheduling. Not INP or real input latency.',
    transfer: 'CDP Network.loadingFinished.encodedDataLength for requested Script/Stylesheet resources; gzip and HTTP 200 asserted. Includes response headers; excludes document/fonts/data. All-resource totals are separate.',
    build: 'Sum of gzip/Brotli per emitted JS/CSS file, host client and three remotes. Includes unrequested chunks; excludes server/fonts/JSON/HTML/maps.',
    scope: 'Local reproducible synthetic benchmark, not Zephyr network performance or a universal speedup. No timing pass/fail thresholds.',
  }, summary, builds, runs }
mkdirSync('docs/evidence', { recursive: true })
writeFileSync('docs/evidence/benchmark.json', JSON.stringify(result, null, 2) + '\n')
const publicSnapshot = JSON.stringify({ ...result, runs: undefined, builds: builds.map(build => ({ ...build, apps: build.apps.map(({ files, ...app }) => app) })) }, null, 2) + '\n'
writeFileSync('apps/host/public/benchmark.json', publicSnapshot)
for (const scenario of scenarios) writeFileSync(`dist/${scenario}/host/client/benchmark.json`, publicSnapshot)
console.table(summary.map(s => ({ build: s.scenario, profile: s.profile, gzipTransfer: Math.round(s.jsCssTransferBytes.median), requests: s.jsCssRequests.median, readyMs: Math.round(s.remoteReadyMs.median), updateMs: s.updateMs.median.toFixed(1) })))

async function startServer(scenario) {
  const child = fork('scripts/benchmark-server.mjs', [scenario], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  let output = ''
  child.stdout.on('data', chunk => { output += chunk })
  child.stderr.on('data', chunk => { output += chunk })
  await new Promise((done, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`Server timeout: ${output}`)) }, 20000)
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)) })
    child.once('message', message => { if (message.ready) { clearTimeout(timer); done() } })
  })
  return () => new Promise(done => { child.once('exit', done); child.send('close') })
}
