import { useEffect, useState } from 'react'

type Distribution = { median: number; p25: number; p75: number }
type Row = { scenario: string; profile: string; runs: number; remoteReadyMs: Distribution; updateMs: Distribution; jsCssTransferBytes: Distribution; jsCssRequests: Distribution; portalJsCssTransferBytes: Distribution }
type Report = { completedAt: string; sourceCommit: string; summary: Row[]; builds: Array<{ scenario: string; apps: Array<{ app: string; gzipBytes: number }> }>; methodology: { rounds: number } }
const labels: Record<string, string> = { react: 'React reference', 'redact-naive': 'Redact · default aliases', 'redact-shared': 'Redact · shared APIs', 'redact-optimized': 'Redact · shared APIs + MF core' }
const repo = 'https://github.com/tonoizer/tanstack-redact-federation-lab'
const format = (n: number, metric: string) => metric === 'ready' ? `${n.toFixed(0)} ms` : `${(n / 1000).toFixed(1)} kB`

export function Benchmarks() {
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState(false)
  const [metric, setMetric] = useState('transfer')
  const [profile, setProfile] = useState('constrained')
  useEffect(() => {
    // Benchmark runs exclude this results payload from their measured page path.
    if (new URLSearchParams(location.search).has('bench')) return
    const controller = new AbortController()
    fetch('/benchmark.json', { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error('Benchmark snapshot unavailable')
      return response.json()
    }).then(setReport).catch(error => { if (error.name !== 'AbortError') setError(true) })
    return () => controller.abort()
  }, [])
  const rows = report?.summary.filter(row => row.profile === profile) ?? []
  const values = rows.map(row => metric === 'build'
    ? report!.builds.find(build => build.scenario === row.scenario)!.apps.reduce((sum, app) => sum + app.gzipBytes, 0)
    : metric === 'ready' ? row.remoteReadyMs.median : row.jsCssTransferBytes.median)
  const max = Math.max(...values, 1)
  const reduction = values.length === 4 ? (1 - values[3] / values[0]) * 100 : null
  return <section className="benchmark-panel" id="benchmarks" aria-labelledby="benchmark-title">
    <div className="benchmark-title"><div><span className="eyebrow">MEASURED, NOT ASSUMED</span><h2 id="benchmark-title">What does sharing actually save?</h2></div><a href={`${repo}/blob/main/docs/BENCHMARKS.md`}>Method + raw results ↗</a></div>
    <p className="benchmark-lede">Two layers to share: the React-compatible runtime and the Federation machinery. Compare the same application with both.</p>
    {report ? <>
      <div className="benchmark-controls"><div className="metric-tabs" aria-label="Benchmark metric">
        {[['transfer', 'Browser JS/CSS'], ['build', 'Emitted JS/CSS'], ['ready', 'Remote-ready time']].map(([key, name]) => <button key={key} aria-pressed={metric === key} onClick={() => setMetric(key)}>{name}</button>)}
      </div><label>Browser profile<select aria-label="Benchmark profile" value={profile} onChange={e => setProfile(e.target.value)}><option value="constrained">4× CPU · 10 Mbps · 40 ms</option><option value="loopback">Local · no throttling</option></select></label></div>
      <div className="benchmark-results"><div className="benchmark-bars" role="img" aria-label={`${metric === 'ready' ? 'Median remote-ready milliseconds' : 'Gzip bytes'} for four build configurations`}>
        {rows.map((row, i) => <div className={`benchmark-row ${row.scenario === 'redact-optimized' ? 'optimized' : ''}`} key={row.scenario}>
          <div className="bar-label"><span>{labels[row.scenario]}</span><b>{format(values[i], metric)}</b></div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${values[i] / max * 100}%` }} /></div>
          <span className="bar-detail">{metric === 'ready' ? `Middle 50%: ${format(row.remoteReadyMs.p25, metric)}–${format(row.remoteReadyMs.p75, metric)}` : metric === 'transfer' ? `${row.jsCssRequests.median} browser requests · cold browser cache` : 'All emitted client JS/CSS files · gzip per file'}</span>
        </div>)}
      </div><aside className="benchmark-takeaway">{metric === 'ready' ? <><b>Local timing</b><p>{report.methodology.rounds} fresh browser contexts per build/profile. Medians and middle 50% are shown. Timings depend on this machine and include synthetic network/CPU settings.</p></> : <><b>{reduction?.toFixed(1)}%</b><span>less {metric === 'transfer' ? 'requested' : 'emitted'} JS/CSS than React in this snapshot</span><p>The final step also changes Federation packaging. The total saving cannot all be attributed to Redact.</p></>}</aside></div>
      <p className="benchmark-footnote">{metric === 'transfer' ? 'Actual gzip HTTP transfers measured with Chromium CDP, including response headers. Excludes HTML, fonts and the results JSON.' : metric === 'build' ? 'Build output totals include unrequested chunks. They are a different measurement from browser transfer.' : 'Time to all three remote DOM nodes plus the counter mount effect. This is a synthetic readiness measure, not INP or a field-performance claim.'} Recorded {new Date(report.completedAt).toISOString().slice(0, 10)} · <a href={`${repo}/blob/main/docs/evidence/benchmark.json`}>Download raw samples</a>.</p>
      <details className="benchmark-details"><summary>Interaction timings and exact numbers</summary><div className="table-scroll"><table><thead><tr><th>Build</th><th>JS/CSS transfer</th><th>Remote-ready median</th><th>Update median</th><th>Portal extra JS/CSS</th><th>Runs</th></tr></thead><tbody>{rows.map(row => <tr key={row.scenario}><th>{labels[row.scenario]}</th><td>{format(row.jsCssTransferBytes.median, 'transfer')}</td><td>{format(row.remoteReadyMs.median, 'ready')}</td><td>{row.updateMs.median.toFixed(1)} ms</td><td>{format(row.portalJsCssTransferBytes.median, 'transfer')}</td><td>{row.runs}</td></tr>)}</tbody></table></div><p>Update = a programmatic context-remote button click followed by two animation frames and sibling DOM validation. Frame scheduling is included; this is not a real-input latency benchmark. Portal extra bytes are measured after its remote has already loaded.</p></details>
    </> : <p className="benchmark-footnote">{error ? 'The recorded snapshot could not be loaded. The raw results are available in the repository.' : 'Loading the recorded benchmark snapshot…'}</p>}
    <details className="config-walkthrough" id="configuration"><summary>How the optimized build works</summary><div className="config-columns">
      <article><span className="eyebrow">1 / SHARE THE REACT API</span><h3>One renderer, one set of imports.</h3><p>The host registers its Redact-backed React, JSX and DOM modules. Remotes skip those aliases and consume host-only singleton shares.</p><pre>{`redact({ skip: reactEntries })\nshared: {\n  react: { singleton: true, import: false }\n}`}</pre></article>
      <article><span className="eyebrow">2 / SHARE FEDERATION TOO</span><h3>Don’t ship the loader three times.</h3><p>The host publishes the official runtime-core provider before loading any remote. Remotes use the experimental external-runtime option. Snapshot support is omitted because this demo loads plain ESM entries.</p><pre>{`// Remote build\nexperiments: { externalRuntime: true }\ndisableSnapshot: true`}</pre></article>
    </div><p>All four builds preserve hooks, context, portals, Suspense and error boundaries. The optimized build requires the matching host provider and pinned Federation versions; its remotes are not standalone apps.</p></details>
  </section>
}
