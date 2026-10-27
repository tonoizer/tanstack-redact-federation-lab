import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import scenarios from '../shared/scenarios.json' with { type: 'json' }
import { sourceProvenance, outputProvenance } from './provenance.mjs'
const selected = process.argv[2] ?? 'redact-shared'
if (selected !== 'all' && !scenarios.includes(selected)) throw new Error(`Unknown scenario: ${selected}`)
for (const scenario of selected === 'all' ? scenarios : [selected]) {
  const source = sourceProvenance()
  for (const app of ['counter', 'context', 'portal', 'host']) {
    console.log(`\nBuilding ${scenario}/${app}`)
    const result = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', `apps/${app}/vite.config.ts`], {
      stdio: 'inherit', env: { ...process.env, LAB_SCENARIO: scenario },
    })
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
  mkdirSync(`dist/${scenario}`, { recursive: true })
  if (source.sourceDigest !== sourceProvenance().sourceDigest) throw new Error('Source changed during the build; rebuild before recording evidence.')
  writeFileSync(`dist/${scenario}/build.json`, JSON.stringify({ scenario, builtAt: new Date().toISOString(), node: process.version, source, outputs: outputProvenance(scenario) }, null, 2))
}
