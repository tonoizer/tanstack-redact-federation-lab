# Benchmarking Redact and Federation sharing

This extension measures **two distinct optimizations**: substituting Redact for React, then reusing Federation infrastructure across remotes. It preserves the existing functional behavior and adds an inspectable fourth build.

The [live demo](../README.md) includes an interactive comparison of emitted size, browser transfer and readiness. [Raw samples](evidence/benchmark.json) include the machine, browser, profiles, timestamps, file hashes, per-request transfers and all individual runs. The [initial experiment](evidence/initial-results.json) remains available as a historical snapshot.

## Recorded result

Final snapshot: **72 samples**, 9 per build/profile, Chromium 156.0.8078.4 on Windows with a Ryzen 5 5600X. Exact timestamps, source/output hashes and every request are in [the raw report](evidence/benchmark.json).

| Build | Requested JS/CSS gzip | Emitted JS/CSS gzip | Emitted Brotli | Constrained ready median | Middle 50% |
| --- | ---: | ---: | ---: | ---: | ---: |
| React | 233,038 B | 235,674 B | 206,926 B | 1,417.5 ms | 1,397.5–1,424.1 ms |
| Redact, default aliases | 205,619 B | 207,729 B | 185,507 B | 1,283.4 ms | 1,271.4–1,298.7 ms |
| Redact, shared APIs | 189,307 B | 191,418 B | 170,487 B | 1,281.2 ms | 1,268.5–1,287.2 ms |
| Redact, shared APIs + MF core | **133,960 B** | **136,076 B** | **121,151 B** | **1,235.3 ms** | 1,223.4–1,245.2 ms |

The optimized variant saves **99,078 requested JS/CSS bytes (42.5%)** against React and **55,347 bytes (29.2%)** against the previous shared-API variant. Its host emitted gzip total is essentially unchanged (94,083 → 94,034 B); each remote drops from about 32 kB to 14 kB. This localizes the additional benefit to Federation packaging.

The React build makes 25 JS/CSS requests; all three Redact builds make 27. Thus the smaller transfer does not come with fewer requests in this setup. All-resource transfer falls from about **600.1 kB to 501.1 kB (~16.5%)**, because fonts and document bytes are outside the JS/CSS reduction.

The constrained local readiness median is about 182 ms lower than React in this snapshot. The unthrottled medians are 211.2, 188.9, 181.0 and 179.6 ms respectively. These are descriptive results from this synthetic setup; they do not establish the same improvement on Zephyr or another device.

Cross-remote update medians are effectively unchanged: **about 33.1 ms** for every constrained build, consistent with the two-animation-frame measurement. All samples observed **zero extra JS/CSS bytes on portal open**, after the portal remote had already loaded.

## Configuration matrix

| Build | React API sharing | Federation runtime |
| --- | --- | --- |
| `react` | Host-provided React 19.3.1 | Included in each remote |
| `redact-naive` | Default Redact aliases; different function exports | Included in each remote |
| `redact-shared` | Host-provided Redact 0.2.1 APIs | Included in each remote |
| `redact-optimized` | Host-provided Redact 0.2.1 APIs | Host-provided runtime-core; remotes externalize it |

The optimized build also omits Federation Snapshot support because this demo loads plain ESM remote entries. No Redact features are disabled: hooks, effects, shared context, hydration, portals, lazy, Suspense and error boundaries are retained. The same browser verification runs against all four builds.

The last step optimizes **Module Federation packaging**. Its benefit should not be described as an additional saving produced by Redact alone. This is not a factorial benchmark: there is no React-with-external-Federation-runtime variant, so it does not isolate the contribution of every setting independently.

## What changed in the optimized configuration

The host imports the official `@module-federation/vite/injectExternalRuntimeCorePlugin` provider and registers it with `createInstance`. Its import publishes the runtime before any remote container evaluates. A Vite alias selects this provider only for the optimized build; the other builds use an empty plugin list.

Remotes opt into:

```ts
federation({
  // Same exposes and host-only singleton shares as redact-shared.
  experiments: { externalRuntime: true },
  disableSnapshot: true,
})
```

The runtime-only host replaces `FEDERATION_OPTIMIZE_NO_SNAPSHOT_PLUGIN` with a build-time `true`. Remote consumption and shared dependency support remain enabled.

These options are documented in the installed plugin’s [external-runtime guide](https://github.com/module-federation/vite/blob/main/README.md#external-runtime-experiments) and the [runtime-size documentation](https://module-federation.io/guide/advanced/runtime-size-optimization.html). `externalRuntime` is experimental. Keep host/remotes on the pinned Federation version and load the provider first. Snapshot-dependent manifests, preloading, HMR/type/devtools workflows need a different configuration; this build is deliberately a production ESM-entry experiment.

## Reproduce the benchmark

```sh
npm ci
npx playwright install chromium
npm run build -- all
npm run benchmark
```

Close other local demo servers first. Ports 4100–4103 must be free. On Linux, use `npx playwright install --with-deps chromium` if system dependencies are missing.

The default is **9 rounds × 4 builds × 2 profiles = 72 fresh browser contexts**, with a fresh server process for every sample. The ordering rotates each round to spread CPU/thermal drift across builds. No warm-up samples are discarded. This is a cold **browser-cache** comparison; filesystem/OS cache and machine conditions are shared.

Each build records its source digest, source commit (or dirty-source status), and output-file hashes. The runner validates them before sampling and again after sampling, rejecting stale source or changed output. The results snapshot itself is excluded from this fingerprint so refreshing the report does not invalidate its measured application code.

For a short smoke run:

```powershell
$env:LAB_BENCH_ROUNDS = '3'
npm run benchmark
Remove-Item Env:LAB_BENCH_ROUNDS
```

Or `LAB_BENCH_ROUNDS=3 npm run benchmark` in a POSIX shell.

The runner writes the full report to `docs/evidence/benchmark.json` and a smaller summary to `apps/host/public/benchmark.json`. It also updates the already-built local host outputs with that summary. Rebuild/deploy the host after recording a new snapshot to publish it. Benchmark pages use `?bench=1` and omit downloading/rendering the results content so the report itself is outside the measured workload. All variants use that same measurement path; normal visitors see the results panel.

## Profiles and metrics

| Profile | CPU | Network |
| --- | --- | --- |
| `loopback` | No synthetic CPU throttling | HTTP loopback, no synthetic latency/bandwidth limit |
| `constrained` | Chromium CPU throttle rate 4 | CDP 10 Mbps download, 5 Mbps upload, 40 ms latency |

Both use the same gzip/no-cache HTTP server for every application. These profiles do not emulate a particular phone and do not measure Internet/CDN/TLS behavior.

**Requested JS/CSS:** Chromium CDP `Network.loadingFinished.encodedDataLength`, summed for actual Script/Stylesheet requests. Successful HTTP status, gzip encoding and completed transfer measurement are asserted. This includes response headers; document, fonts and report JSON are excluded. All-resource transfer is recorded separately.

**Emitted JS/CSS:** every emitted client `.js`/`.css` file for the host and three remotes, separately gzip/Brotli compressed. This includes unrequested chunks and is not interchangeable with browser transfer. Server code, fonts, maps, JSON and HTML are excluded. Per-file SHA-256 hashes identify the measured build outputs.

**Remote-ready:** `performance.now()` at the first animation frame containing all three remote DOM nodes and the counter’s mounted effect. It starts at navigation and includes the SSR response, browser loading, hydration and remote initialization. Playwright’s polling overhead is excluded because the timestamp is captured inside the page. It does not mean every future interaction is ready.

**Cross-remote update:** 12 programmatic context-remote button clicks per sample, each followed by two animation frames and validation that the sibling remote observes the increment. This includes frame scheduling and is **not INP**, trusted-user input latency or a scheduler stress test. Similar values near two frame intervals are expected and do not establish a speed advantage.

**Portal-open delta:** new requests after opening the already-loaded portal remote are recorded separately. Zero additional JS/CSS bytes means its required code was already loaded; it is not a statement that the portal costs zero bytes on initial load.

**FCP and long tasks:** recorded as supporting diagnostics for the initial load. FCP can occur in the SSR shell before any remote is ready. Long-task totals cover the recorded initial-load window, not the later interaction sequence.

The report shows medians and the middle 50% range (25th–75th percentile). Small timing differences on one machine are descriptive and should not be promoted as universal speedups. There are no timing pass/fail thresholds.

## Development attempt history

One earlier development attempt stopped at a 30-second readiness-check timeout in the constrained/default-alias sample, after 37 completed samples. No completed report was produced. That attempt preceded failure snapshots, so its root cause is unknown and is not attributed to either runtime. See [the retained observation](evidence/development-timeout.json). The instrumented harness subsequently completed a full 72-sample attempt. Published medians describe the completed attempt, not a claimed failure rate across all development runs. The runner now saves failure details and aborts instead of silently retrying a sample.

## How to interpret the benefits

1. Read the **payload** numbers first: they are deterministic for a given set of emitted/requested files under this transport.
2. Compare `redact-shared` against `redact-optimized` to inspect the effect of changing Federation packaging.
3. Compare timings with their spread and profile. A smaller transfer does not guarantee a faster render or update.
4. Inspect the request list: fewer bytes can come with the same or a greater number of small requests.
5. Keep fonts/document bytes separate from the JS/CSS result; the all-resource metric exposes their contribution.
6. Treat the deployed Zephyr functional checks separately. Local benchmark timings do not establish a Zephyr CDN performance claim.

See [the findings](FINDINGS.md) for compatibility and SSR limits, and [the runner](../scripts/benchmark.mjs) for the complete implementation.
