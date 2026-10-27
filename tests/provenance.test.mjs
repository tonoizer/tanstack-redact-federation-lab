import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { sourceProvenance, outputProvenance, validateBuild } from '../scripts/provenance.mjs'

test('benchmark provenance rejects changed source and outputs, while allowing results refresh', () => {
  const parent = resolve('artifacts/latest')
  mkdirSync(parent, { recursive: true })
  const root = mkdtempSync(join(parent, 'provenance-'))
  mkdirSync(join(root, 'apps/host/public'), { recursive: true })
  mkdirSync(join(root, 'dist/example/host/client'), { recursive: true })
  writeFileSync(join(root, 'apps/host/source.ts'), 'export const value = 1')
  writeFileSync(join(root, 'dist/example/host/client/app.js'), 'const value = 1')
  const manifest = { source: sourceProvenance(root), outputs: outputProvenance('example', root) }
  assert.doesNotThrow(() => validateBuild('example', manifest, root))
  writeFileSync(join(root, 'apps/host/public/benchmark.json'), '{"runs":9}')
  writeFileSync(join(root, 'apps/host/routeTree.gen.ts'), '// generated')
  writeFileSync(join(root, 'dist/example/host/client/benchmark.json'), '{"runs":9}')
  assert.doesNotThrow(() => validateBuild('example', manifest, root))
  writeFileSync(join(root, 'apps/host/source.ts'), 'export const value = 2')
  assert.throws(() => validateBuild('example', manifest, root), /Stale source/)
  writeFileSync(join(root, 'apps/host/source.ts'), 'export const value = 1')
  writeFileSync(join(root, 'dist/example/host/client/app.js'), 'const value = 2')
  assert.throws(() => validateBuild('example', manifest, root), /Changed build output/)
})
