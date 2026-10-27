# Findings: Redact across Module Federation boundaries

Experiment date: **2026-10-27**. The lockfile pins the full dependency graph. Exact versions, browser version, timestamps, test results, identity tables, and file-size measurements are in [the evidence snapshot](evidence/results.json).

## Result

**Redact 0.2.1 worked for the client-side Federation boundaries exercised by this demo.** The production-built TanStack Start host loaded three independently compiled Vite ESM containers from three separate origins. Shared hooks, context updates, callbacks, portals, lazy loading, and remounts passed.

The initial five checks also passed against the four applications deployed to Zephyr Cloud. React 19.3.1 supplies the reference configuration. The extended demo adds a fourth optimized build and a benchmark showcase test; see [the benchmark report](BENCHMARKS.md) for the current measurements and method.

| Configuration | Interaction tests | Function identity vs host | Shared context object |
| --- | --- | --- | --- |
| `react` | Pass | Same | Same |
| `redact-naive` — default Redact aliases | Pass | Different | Same |
| `redact-shared` — explicit host shares | Pass | Same | Same |
| `redact-optimized` — shared APIs + external MF core | Pass | Same | Same |
| Zephyr live — `redact-shared` | Pass | Same | Same |

“Naive” is only the scenario name. It is **not** a failed compatibility case. The experiment originally investigated duplicate-dispatcher failures; actual browser results did not show those failures, so the test records the observed behavior instead.

## 1. Default aliases do not prove Federation deduplication

The official `redact()` Vite plugin redirects React API import names to Redact files. In this combination of Redact 0.2.1, Vite 8.3.5, and `@module-federation/vite` 1.23.6, enabling default aliases in each remote produces distinct `useState`, `useContext`, and `createElement` function exports. The portal remote’s `createPortal` also differs from the host’s.

The regular Federation `shared.react` declaration alone therefore does **not** establish one set of exported functions when Redact’s import rewriting is active. The browser identity probes compare actual references using `===`; the result is visible in the host’s table and recorded in JSON.

The shared context object remains identical because `@lab/contract` is an explicit host-provided singleton in every scenario.

## 2. Different exports still passed the tested interactions

All five functional tests passed in the default-alias build. This is consistent with Redact’s implementation: its hook dispatcher backing object is stored on `globalThis` under `Symbol.for('@tanstack/redact.ReactSharedInternals')`.

This lets copies in the **same JavaScript global** reach the same dispatcher object. It explains why different hook wrapper functions did not automatically cause invalid-hook-call errors here. The browser behavior is observed; the dispatcher explanation comes from reading [the 0.2.1 source](https://github.com/TanStack/redact/blob/20f6dd6bf2dda0c52c3d5670ba6be5f0991bf8ff/packages/redact/src/react/shared-internals.ts).

This does not establish safety for different Redact versions, incompatible feature flags, iframes, workers, or separate JavaScript realms. The global dispatcher is also not evidence that downloaded code was deduplicated.

## 3. Explicit Federation sharing makes the probes identical

The working explicit-sharing recipe has two sides.

**Host:** use `redact()` normally, import the React/DOM/JSX modules through those aliases, and register those module objects using Federation’s runtime `shared` API with synchronous `lib` factories.

**Remotes:** keep ordinary React imports, but skip Redact aliasing for the import names Federation owns:

```ts
redact({
  skip: [
    'react',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'react-dom',
    'react-dom/client',
  ],
})
```

Declare those exact entries as singleton shares with `import: false` so the host supplies them:

```ts
shared: {
  react: { singleton: true, import: false, requiredVersion: false },
  'react/jsx-runtime': { singleton: true, import: false, requiredVersion: false },
  'react-dom': { singleton: true, import: false, requiredVersion: false },
  // Full list in shared/build-config.ts
}
```

Sharing a base package name is not a reason to assume all subpaths share too. This demo enumerates its entry points. It additionally shares the `@lab/contract` package, which owns the context object. The renderer and imported APIs then come from the host, and all recorded identity probes pass.

Share versions explicitly identify Redact as 0.2.1 or React as 19.3.1. `requiredVersion: false` is intentional in this controlled, pinned demo; it is not a compatibility check for mixing runtimes. All deployed apps use the same Redact version and full preset.

## 4. State and context really cross the boundary

The tests do more than mount static remote markup:

- The counter’s own `useState` updates twice; its `useEffect` runs.
- A remote invokes a host callback, updating the host-owned provider.
- A second remote observes the new count and updated message.
- The portal remote calls shared `createPortal` into `document.body`.
- Context remains available inside that portal, and its callback updates the host and sibling remote.
- Unmounting/remounting resets the counter’s local state while retaining host state.
- A delayed remote displays its Suspense fallback while another remote is usable.
- An aborted remote entry reaches its error boundary; other remotes keep working and the host reports the failed remote.

No custom DOM-event bus, serialized state bridge, or separate React root is used to make these interactions work. The host and remote components participate in one render tree.

## 5. Start’s SSR boundary needs consistent runtime resolution

The host shell is server rendered and hydrated. Initial setup exposed a server-side mismatch: upstream React DOM rendered components whose hooks had been aliased to Redact. Inlining server dependencies with `ssr: { noExternal: true }` made the Node production build resolve the server renderer and React API consistently through the Redact plugin.

This is a setup observation from this project, not a universal requirement for every Start adapter. The deployment build additionally uses the Cloudflare Vite adapter to produce a Worker-compatible server entry for Zephyr.

The hydration test checks HTTP-rendered content and confirms that one server-created heading element survives client hydration. **Remote components are loaded after hydration in the browser. Federated remote SSR and hydration are not tested.**

## 6. Zephyr deployment works as four applications

The remotes use `vite-plugin-zephyr` 1.7.0. The host uses `vite-plugin-tanstack-start-zephyr` 1.7.0 with `@cloudflare/vite-plugin` 1.65.0. All four applications are in the dedicated `kevin-beier/redact-mf-lab` project.

Deployment order is remote → remote → remote → host. The custom Federation-runtime host pins the three returned immutable remote URLs. The Start adapter does not automatically resolve Federation remote selectors; the deployment script handles the URL handoff explicitly. See [deployment details](DEPLOYMENT.md).

Live verification checks actual cross-origin remote responses, reference identity, the host’s SSR shell/hydration, interactions, a delayed remote, and an aborted remote. A successful upload or HTTP 200 alone would not establish this result.

## 7. Bundle measurements have a narrow meaning

[results.json](evidence/results.json) includes per-file and per-application raw/gzip sizes for the current local builds. The script includes every emitted client `.js` and `.css` file for the host and three remote outputs. It excludes server files, fonts, JSON, HTML, and source maps.

These totals help inspect duplication and Federation overhead. They are not a measured page download, Core Web Vitals, CPU-time result, or a general percentage saving attributable to Redact. No rendering-performance claim is made.

| Build | Host | Counter | Context | Portal | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| React | 135,262 | 32,390 | 32,301 | 32,655 | **232,608** |
| Redact, default aliases | 91,050 | 32,343 | 32,259 | 49,048 | **204,700** |
| Redact, explicit shares | 91,050 | 32,379 | 32,299 | 32,657 | **188,385** |

All values in this historical table are **gzip bytes** from [the initial snapshot](evidence/initial-results.json), before the benchmark UI was added. For that exact build, explicit sharing produced 44,223 fewer emitted gzip bytes than the React reference and 16,315 fewer than the default-alias Redact variant. These numbers include each remote’s Federation infrastructure. Do not mix them with the current build or browser-transfer numbers.

## 8. Further optimization: share the Federation runtime

The fourth build, `redact-optimized`, keeps explicit React API sharing and reuses the host’s Federation runtime-core. Its remotes no longer bundle their own copy. Snapshot support is omitted for this plain-ESM-entry experiment. This is an infrastructure packaging optimization in addition to using Redact, not an additional saving attributable to Redact alone.

The [benchmark report](BENCHMARKS.md) distinguishes emitted gzip/Brotli totals, actual browser JS/CSS transfers, all-resource transfers, readiness, long tasks, and cross-remote update timings. It includes repeated runs, two profiles, per-file hashes and a stale-build guard. All Redact features remain enabled. The live host lets visitors switch metrics and inspect the configuration.

## Scope and untested cases

- Chromium on Windows locally; Linux CI runs the same local suite separately.
- Production builds, one Start host, three Vite ESM remotes, one JS global.
- React 19.3.1 reference; Redact 0.2.1 full preset; exact installed versions in evidence.
- No federated SSR, Server Components/Flight, cross-bundler remotes, mixed runtime versions, React-host/Redact-remote mixing, concurrent scheduling benchmarks, Safari/Firefox, HMR, remote nested containers, iframe/worker isolation, or authentication flows.
- No claim that every React API or third-party component library works across these boundaries.

## References

- [Official Redact Vite plugin reference](https://tanstack.com/redact/latest/docs/vite-plugin)
- [Redact 0.2.1 Vite plugin source](https://github.com/TanStack/redact/blob/20f6dd6bf2dda0c52c3d5670ba6be5f0991bf8ff/packages/redact/src/vite/index.ts)
- [Redact 0.2.1 shared dispatcher source](https://github.com/TanStack/redact/blob/20f6dd6bf2dda0c52c3d5670ba6be5f0991bf8ff/packages/redact/src/react/shared-internals.ts)
- [Module Federation runtime API](https://module-federation.io/guide/runtime/runtime-api)
- [Zephyr TanStack Start integration](https://docs.zephyr-cloud.io/meta-frameworks/tanstack-start)

The installed source and browser results are the source of truth for this snapshot; live documentation may change.
