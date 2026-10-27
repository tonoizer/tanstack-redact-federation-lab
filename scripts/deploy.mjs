import { spawnSync, execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const file = 'deployments/zephyr.json'
mkdirSync('deployments', { recursive: true })
let state = { organization: 'kevin-beier', project: 'redact-mf-lab', scenario: 'redact-shared', remotes: {}, applications: {} }
try { state = JSON.parse(readFileSync(file, 'utf8')) } catch {}
for (const app of ['counter', 'context', 'portal', 'host']) {
  console.log(`\nDeploying ${app} to Zephyr Cloud`)
  const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', `apps/${app}/vite.config.ts`], {
    encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, LAB_SCENARIO: 'redact-shared', LAB_DEPLOY: '1', ZE_FAIL_BUILD: 'true' },
  })
  process.stdout.write(result.stdout ?? '')
  process.stderr.write(result.stderr ?? '')
  if (result.status !== 0) process.exit(result.status ?? 1)
  const output = `${result.stdout}\n${result.stderr}`.replace(/\x1b\[[0-9;]*m/g, '')
  const urls = output.match(/https:\/\/[a-zA-Z0-9.-]+\.zephyr-cloud\.io\/?/g) ?? []
  const url = urls.findLast(url => !/https:\/\/(app|api|docs|mcp)\./.test(url))
  if (!url) throw new Error(`No Zephyr deployment URL reported for ${app}; publication is not confirmed.`)
  const response = await fetch(app === 'host' ? url : new URL('/remoteEntry.js', url))
  if (!response.ok) throw new Error(`Published ${app} returned HTTP ${response.status}`)
  state.applications[app] = { url, deployedAt: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() }
  if (app !== 'host') state.remotes[app] = new URL('/remoteEntry.js', url).href
  writeFileSync(file, JSON.stringify(state, null, 2) + '\n')
}
console.log(`\nLive demo: ${state.applications.host.url}`)
