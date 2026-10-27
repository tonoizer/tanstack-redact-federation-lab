import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
const deployment = JSON.parse(readFileSync('deployments/zephyr.json', 'utf8'))
if (!deployment.applications.host?.url) throw new Error('Deploy the host first.')
if (!deployment.hostRemotes) throw new Error('The host deployment has no recorded remote pins. Redeploy the host.')
const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], {
  stdio: 'inherit', env: { ...process.env, LAB_SCENARIO: 'redact-shared', LAB_BASE_URL: deployment.applications.host.url },
})
process.exit(result.status ?? 1)
