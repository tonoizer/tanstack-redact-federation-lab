import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { redact } from '@tanstack/redact/vite'
import { readFileSync } from 'node:fs'
import { cloudflare } from '@cloudflare/vite-plugin'
import { withZephyr } from 'vite-plugin-tanstack-start-zephyr'
import { repoRoot, scenario, deploy, optimized } from '../../shared/build-config.ts'

const remoteEntries = deploy
  ? JSON.parse(readFileSync(resolve(repoRoot, 'deployments/zephyr.json'), 'utf8')).remotes
  : Object.fromEntries(['counter', 'context', 'portal'].map((name, i) => [name, `http://localhost:${4101 + i}/remoteEntry.js`]))

export default defineConfig({
  root: resolve(repoRoot, 'apps/host'),
  plugins: [
    ...(deploy ? [cloudflare({ configPath: resolve(repoRoot, 'apps/host/wrangler.jsonc'), viteEnvironment: { name: 'ssr' } })] : []),
    tanstackStart(), react(), ...(scenario === 'react' ? [] : [redact()]),
    ...(deploy ? [withZephyr({ outputDir: resolve(repoRoot, 'dist/zephyr/host'), entrypoint: 'server/index.js' })] : []),
  ],
  ssr: { noExternal: true },
  resolve: { alias: { '@lab/runtime-provider': resolve(repoRoot, `apps/host/src/runtime-provider${optimized ? '' : '-none'}.ts`) } },
  define: {
    __LAB_SCENARIO__: JSON.stringify(scenario),
    __LAB_REMOTES__: JSON.stringify(remoteEntries),
    __LAB_OPTIMIZED__: JSON.stringify(optimized),
    ...(optimized ? { FEDERATION_OPTIMIZE_NO_SNAPSHOT_PLUGIN: 'true' } : {}),
  },
  server: { port: 4100, strictPort: true },
  preview: { port: 4100, strictPort: true },
  build: { outDir: resolve(repoRoot, `dist/${deploy ? 'zephyr' : scenario}/host`), emptyOutDir: true },
})
