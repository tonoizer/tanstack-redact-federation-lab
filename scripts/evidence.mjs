import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { gzipSync } from 'node:zlib'
import scenarioNames from '../shared/scenarios.json' with { type: 'json' }

const packages = JSON.parse(readFileSync('package.json', 'utf8'))
const scenarios = [...scenarioNames, 'zephyr-live']
const results = scenarios.map(name => {
  const report = JSON.parse(readFileSync(`artifacts/latest/${name}-playwright.json`, 'utf8'))
  if (report.stats.unexpected || report.stats.flaky || report.errors.length) throw new Error(`${name} has test failures; cannot record successful evidence`)
  const tests = []
  function collect(suites) {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) tests.push({ title: spec.title, status: spec.tests[0].results.at(-1).status })
      collect(suite.suites ?? [])
    }
  }
  collect(report.suites)
  return { name, identity: JSON.parse(readFileSync(`artifacts/latest/${name}-identity.json`, 'utf8')), tests }
})

const bundles = []
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)])
}
for (const scenario of scenarios.filter(name => name !== 'zephyr-live')) {
  const apps = ['host', 'counter', 'context', 'portal'].map(app => {
    const root = `dist/${scenario}/${app}${app === 'host' ? '/client' : ''}`
    const entries = files(root).filter(path => /\.(js|css)$/.test(path)).map(path => {
      const data = readFileSync(path)
      return { file: relative(root, path).replaceAll('\\', '/'), bytes: data.length, gzipBytes: gzipSync(data).length }
    })
    return { app, bytes: entries.reduce((n, e) => n + e.bytes, 0), gzipBytes: entries.reduce((n, e) => n + e.gzipBytes, 0), files: entries }
  })
  bundles.push({ scenario, apps, totalGzipBytes: apps.reduce((n, e) => n + e.gzipBytes, 0) })
}
const evidence = {
  recordedAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  versions: { ...packages.dependencies, ...packages.devDependencies },
  scope: 'Production builds; Chromium; one JavaScript global; SSR host shell; browser-loaded remote components.',
  results,
  bundles: { method: 'Sum of gzipSync per emitted JS/CSS file; host client only, all three remote outputs. Excludes server, fonts, maps, JSON and HTML. Build output totals, not measured network transfer or rendering performance.', scenarios: bundles },
}
mkdirSync('docs/evidence', { recursive: true })
writeFileSync('docs/evidence/results.json', JSON.stringify(evidence, null, 2) + '\n')
for (const name of ['redact-shared', 'redact-naive', 'redact-optimized', 'zephyr-live']) copyFileSync(`artifacts/latest/${name}-desktop.png`, `docs/evidence/${name}.png`)
console.log(JSON.stringify({ tests: results.map(r => ({ scenario: r.name, passed: r.tests.filter(t => t.status === 'passed').length, skipped: r.tests.filter(t => t.status === 'skipped').length })), bundles: bundles.map(b => ({ scenario: b.scenario, totalGzipBytes: b.totalGzipBytes })) }, null, 2))
