const repo = 'https://github.com/tonoizer/tanstack-redact-federation-lab'

export function Findings() {
  return <section className="findings" aria-labelledby="findings-title">
    <div className="findings-heading"><div><span className="eyebrow">EXPERIMENT NOTES / REDACT 0.2.1</span><h2 id="findings-title">What we learned.</h2></div><a href={`${repo}/blob/main/docs/FINDINGS.md`}>Read the full findings ↗</a></div>
    <div className="notes-grid">
      <article><span className="eyebrow">01 / THE ANSWER</span><h3>Yes, for these boundaries.</h3><p>A TanStack Start host can render three independently built, HTTP-loaded remotes with Redact. Local browser tests cover hooks, provider updates, callbacks into the host, portals, lazy loading, and remounts.</p></article>
      <article><span className="eyebrow">02 / THE SHARING DETAIL</span><h3>Aliases and sharing are separate.</h3><p>Default Redact aliases passed the interaction tests but produced different function exports. Redact 0.2.1 shares its hook dispatcher through a global symbol. Matching behavior alone does not prove module deduplication.</p></article>
      <article><span className="eyebrow">03 / THE EXPLICIT CONFIGURATION</span><h3>Let Federation own the imports.</h3><p>The host registers its Redact-backed React and DOM modules. Remotes use singleton shares with <code>import: false</code>; Redact skips the shared React import names there. The shared context object is provided once by the host.</p></article>
      <article><span className="eyebrow">04 / THE LIMIT</span><h3>A measured result, with a scope.</h3><p>The host shell is server rendered and hydrated. Remote components load in the browser. Federated SSR, mixed Redact versions, React/Redact mixing, cross-bundler remotes, and iframe boundaries are outside this experiment.</p></article>
    </div>
    <div className="reproduce"><span>REPRODUCE THE BUILD MATRIX</span><code>npm ci &amp;&amp; npm run build -- all &amp;&amp; npm run verify -- all</code><a href={`${repo}/blob/main/docs/REPLY.md`}>Reply draft ↗</a></div>
    <p className="deployment-note">Hosted on Zephyr Cloud: one SSR host and three separate remote deployments. The host pins the remote version URLs recorded in <a href={`${repo}/blob/main/deployments/zephyr.json`}>the deployment manifest</a>.</p>
  </section>
}
