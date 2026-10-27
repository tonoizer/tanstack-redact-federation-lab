import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { redact } from '@tanstack/redact/vite'
import { federation } from '@module-federation/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { withZephyr } from 'vite-plugin-zephyr'
import scenarioNames from './scenarios.json' with { type: 'json' }

export const repoRoot = fileURLToPath(new URL('../', import.meta.url))
export const scenarios = scenarioNames
export type Scenario = 'react' | 'redact-naive' | 'redact-shared' | 'redact-optimized'
export const scenario = (process.env.LAB_SCENARIO ?? 'redact-shared') as Scenario
export const deploy = process.env.LAB_DEPLOY === '1'
export const optimized = scenario === 'redact-optimized'
if (!scenarios.includes(scenario)) throw new Error(`Unknown scenario: ${scenario}`)
export const reactEntries = ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client']

export function remoteConfig(name: string, port: number) {
  return defineConfig({
    root: resolve(repoRoot, `apps/${name}`),
    plugins: [
      react(),
      ...(scenario === 'react' ? [] : [redact({
        // Let federation intercept these names before they become local file paths.
        skip: scenario === 'redact-shared' || optimized ? reactEntries : [],
      })]),
      federation({
        name,
        filename: 'remoteEntry.js',
        exposes: { './Widget': './src/Widget.tsx' },
        shared: Object.fromEntries([
          ...reactEntries.map(key => [key, {
            singleton: true, import: false as const, requiredVersion: false as const,
            version: scenario === 'react' ? '19.3.1' : '0.2.1',
          }]),
          ['@lab/contract', {
            singleton: true, import: false as const, requiredVersion: false as const,
            version: '1.0.0', suppressMissingImportWarning: true,
          }],
        ]),
        dts: false,
        manifest: true,
        ...(optimized ? { experiments: { externalRuntime: true }, disableSnapshot: true } : {}),
      }),
      ...(deploy ? withZephyr() : []),
    ],
    server: { port, origin: `http://localhost:${port}`, cors: true },
    build: { target: 'esnext', outDir: resolve(repoRoot, `dist/${deploy ? 'zephyr' : scenario}/${name}`), emptyOutDir: true },
  })
}
