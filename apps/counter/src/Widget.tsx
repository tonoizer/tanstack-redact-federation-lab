import { useState, useEffect, useContext, createElement } from 'react'
import { LabContext } from '@lab/contract'

export const identity = { useState, useContext, createElement, LabContext }

export default function Counter() {
  const [local, setLocal] = useState(0)
  const [effect, setEffect] = useState('waiting')
  const { count, increment } = useContext(LabContext)
  useEffect(() => { setEffect('mounted'); return () => { /* exercises effect cleanup */ } }, [])
  return <section className="remote" data-testid="counter">
    <div className="remote-top"><span>01 / COUNTER</span><span>:4101</span></div>
    <h2>State travels.</h2>
    <p>Remote hooks, rendered by the host.</p>
    <div className="big-number" data-testid="local-count">{local}</div>
    <div className="buttons"><button onClick={() => setLocal(n => n + 1)}>Increment local</button><button className="secondary" onClick={increment}>Increment host</button></div>
    <div className="readout">Host count <b data-testid="counter-host-count">{count}</b> · Effect <b data-testid="effect">{effect}</b></div>
  </section>
}
