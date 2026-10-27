# Zephyr deployment

The demo is deployed under [kevin-beier / redact-mf-lab](https://app.zephyr-cloud.io/org/kevin-beier/redact-mf-lab). The project dashboard requires your Zephyr account. The immutable version URLs in [zephyr.json](../deployments/zephyr.json) are publicly reachable and are the canonical deployment record.

## Layout

| Package | Zephyr application UID | Adapter |
| --- | --- | --- |
| `apps/counter` | `counter.redact-mf-lab.kevin-beier` | `vite-plugin-zephyr` |
| `apps/context` | `context.redact-mf-lab.kevin-beier` | `vite-plugin-zephyr` |
| `apps/portal` | `portal.redact-mf-lab.kevin-beier` | `vite-plugin-zephyr` |
| `apps/host` | `start-host.redact-mf-lab.kevin-beier` | `vite-plugin-tanstack-start-zephyr` |

Organization/project selection lives in [zephyr.config.mjs](../zephyr.config.mjs). App names come from the separate package manifests. Fork users should change the organization/project to their own account before deploying.

Normal `npm run build` and browser tests do not activate Zephyr publication. `scripts/deploy.mjs` sets `LAB_DEPLOY=1` and `ZE_FAIL_BUILD=true`, builds the remotes in order, captures their immutable URLs, and compiles them into the host’s Federation runtime registration. It confirms each remote entry is available over HTTP and the SSR host returns a successful response. It updates the manifest after each successful application deployment.

The Zephyr TanStack Start integration does not resolve `zephyr:dependencies` into remote URLs. This demo uses a runtime-API host, so it handles the handoff using the newly deployed immutable URLs. There is no claim of selector/environment resolution or automated promotion. Updating a remote requires rebuilding the host against its new URL. Previous immutable host versions keep their original pins. The manifest separates the latest published `remotes` from `hostRemotes`, the pins used by the last successfully deployed host; live tests use `hostRemotes` even if a later remote-only deployment or partial deployment publishes newer remotes.

## Authentication

No tokens are stored in this repository. Use Zephyr’s SDK browser login or supply the supported CI credential through your environment/secret manager.

On a machine that is not authenticated, run a remote build in a real interactive terminal to trigger the SDK login:

PowerShell:

```powershell
$env:LAB_DEPLOY = '1'
$env:LAB_SCENARIO = 'redact-shared'
$env:ZE_FAIL_BUILD = 'true'
node node_modules/vite/bin/vite.js build --config apps/counter/vite.config.ts
Remove-Item Env:LAB_DEPLOY, Env:LAB_SCENARIO, Env:ZE_FAIL_BUILD
```

POSIX shell:

```sh
LAB_DEPLOY=1 LAB_SCENARIO=redact-shared ZE_FAIL_BUILD=true \
  node node_modules/vite/bin/vite.js build --config apps/counter/vite.config.ts
```

Press Enter when prompted, finish the normal browser sign-in, and return to the terminal. This first command also deploys the counter remote. Subsequent deployment-script builds reuse the SDK’s local authentication.

## Deploy and verify

```sh
npm run deploy
npm run verify:live
```

To update only the host, retaining the manifest’s current remote pins:

```sh
npm run deploy -- host
npm run verify:live
```

The host’s deployment build uses Cloudflare’s Vite plugin to produce `dist/zephyr/host/server/index.js` and browser assets. The Start-specific Zephyr adapter uploads both as an SSR snapshot. The remotes are separate static ESM-container snapshots.

Local verification uses Node production preview output under `dist/<scenario>/host`; it does not run the Cloudflare deployment adapter. Live verification checks the deployed Worker plus real remote origins.

## GitHub Actions

The checked-in workflow verifies the local matrix and uploads evidence. It does not deploy or require a Zephyr secret. Live publication is an explicit `npm run deploy` action. If you later add deployment to CI, configure Zephyr’s recommended CI token in GitHub Secrets rather than checking a token into a file.

The Zephyr API MCP can inspect deployment control-plane state, but no Zephyr MCP connection was exposed in the session that created this demo. Publication used the official build SDKs and the existing Zephyr browser account.
