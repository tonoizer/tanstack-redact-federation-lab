import { spawnSync } from 'node:child_process'
import scenarios from '../shared/scenarios.json' with { type: 'json' }
const selected = process.argv[2] ?? 'redact-shared'
if (selected !== 'all' && !scenarios.includes(selected)) throw new Error(`Unknown scenario: ${selected}`)
for (const scenario of selected === 'all' ? scenarios : [selected]) {
  const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test'], {
    stdio: 'inherit', env: { ...process.env, LAB_SCENARIO: scenario },
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
