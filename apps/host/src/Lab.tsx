import { Component, lazy, Suspense, useEffect, useState, type ReactNode } from 'react'
import { LabContext } from '@lab/contract'

type Check = { remote: string; checks: Record<string, boolean> }
const remoteNames = ['counter', 'context', 'portal']

class Boundary extends Component<{ children: ReactNode; name: string }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(error: Error) { return { error: error.message } }
  render() {
    return this.state.error ? <div className="remote error" data-testid={`${this.props.name}-error`}><h2>Remote failed</h2><pre>{this.state.error}</pre></div> : this.props.children
  }
}

export function Lab() {
  const [count, setCount] = useState(0)
  const [message, setMessage] = useState('Hello from the Start host')
  const [checks, setChecks] = useState<Check[]>([])
  const [failures, setFailures] = useState<string[]>([])
  const [widgets, setWidgets] = useState<Array<{ name: string; Widget: ReturnType<typeof lazy> }>>([])
  const [mounted, setMounted] = useState(true)
  useEffect(() => {
    setWidgets(remoteNames.map(name => ({ name, Widget: lazy(async () => {
      try {
        const { loadWidget } = await import('./federation')
        const { module, checks } = await loadWidget(name)
        setChecks(current => [...current.filter(c => c.remote !== name), { remote: name, checks }])
        return module
      } catch (error) {
        setFailures(current => [...current, name])
        throw error
      }
    }) })))
  }, [])
  const allSame = checks.length === 3 && checks.every(c => Object.values(c.checks).every(Boolean))
  const status = failures.length ? `Remote load failed: ${failures.join(', ')}` : checks.length < 3 ? 'Checking runtime identity…' : allSame ? 'Same runtime across all remotes' : 'Runtime identity mismatch'
  return <main>
    <header><a className="wordmark" href="/">R/F<span>RUNTIME LAB</span></a><span className="header-note">EXPERIMENT 001 · MODULE FEDERATION</span><a href="https://github.com/tonoizer/tanstack-redact-federation-lab">Source ↗</a></header>
    <div className="hero"><div><span className="eyebrow">TANSTACK START + THREE INDEPENDENT REMOTES</span><h1>Can we Redact<br />across <em>boundaries?</em></h1><p className="intro">One host. Three origins. A runtime sharing experiment you can inspect, break, and reproduce.</p></div><div className="stamp"><b>3</b><span>REMOTES<br />ONE RENDER TREE</span></div></div>
    <div className="experiment-bar"><span>ACTIVE BUILD <b data-testid="scenario">{__LAB_SCENARIO__}</b></span><span className={allSame ? 'status success' : 'status'} data-testid="identity-status">{status}</span></div>
    <section className="host-panel"><div><span className="eyebrow">HOST / :4100</span><h2 data-testid="ssr-probe">The shared source of truth.</h2><p>Server-rendered shell, hydrated by the selected runtime. Remotes load in the browser.</p></div><div className="host-controls"><label>Provider message<input aria-label="Provider message" value={message} onChange={e => setMessage(e.target.value)} /></label><div className="buttons"><button onClick={() => setCount(n => n + 1)}>Host count: <span data-testid="host-count">{count}</span> +</button><button className="secondary" onClick={() => setMounted(v => !v)}>{mounted ? 'Unmount remotes' : 'Mount remotes'}</button></div></div></section>
    <LabContext.Provider value={{ count, message, increment: () => setCount(n => n + 1) }}>
      <div className="remote-grid">{mounted && widgets.map(({ name, Widget }) => <Boundary key={name} name={name}><Suspense fallback={<div className="remote loading" data-testid={`${name}-loading`}>Loading {name} over HTTP…</div>}><Widget /></Suspense></Boundary>)}</div>
    </LabContext.Provider>
    <section className="evidence"><div><span className="eyebrow">LIVE EVIDENCE</span><h2>Identity, not assumptions.</h2><p>Strict equality against the host's actual imports. A green check means the same function or context object crossed the federation boundary.</p></div><table><thead><tr><th>Remote</th><th>useState</th><th>useContext</th><th>createElement</th><th>Context object</th><th>createPortal</th></tr></thead><tbody>{remoteNames.map(name => { const row = checks.find(c => c.remote === name); return <tr key={name}><th>{name}</th>{['useState', 'useContext', 'createElement', 'contextObject', 'createPortal'].map(key => <td key={key} data-testid={`identity-${name}-${key}`}>{row?.checks[key] === undefined ? '—' : row.checks[key] ? 'PASS' : 'FAIL'}</td>)}</tr> })}</tbody></table></section>
    <footer><span>Built to answer a question, not assume the answer.</span><span>SSR SHELL · CLIENT-LOADED REMOTES · PRODUCTION BUILDS</span></footer>
  </main>
}
