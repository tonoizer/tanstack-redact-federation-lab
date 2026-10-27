import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import scenarios from '../shared/scenarios.json' with { type: 'json' }
const selected = process.argv[2] ?? 'redact-shared'
if (selected !== 'all' && !scenarios.includes(selected)) throw new Error(`Unknown scenario: ${selected}`)
for (const scenario of selected === 'all' ? scenarios : [selected]) {
  for (const app of ['counter', 'context', 'portal', 'host']) {
    console.log(`\nBuilding ${scenario}/${app}`)
    const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', `apps/${app}/vite.config.ts`], {
      stdio: 'inherit', env: { ...process.env, LAB_SCENARIO: scenario },
    })
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
  mkdirSync(`dist/${scenario}`, { recursive: true })
  writeFileSync(`dist/${scenario}/build.json`, JSON.stringify({ scenario, builtAt: new Date().toISOString(), node: process.version }, null, 2))
}
