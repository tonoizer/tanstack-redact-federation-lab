import { useState, useContext, createElement } from 'react'
import { createPortal } from 'react-dom'
import { LabContext } from '@lab/contract'

export const identity = { useState, useContext, createElement, createPortal, LabContext }

export default function PortalWidget() {
  const [open, setOpen] = useState(false)
  const { count, increment } = useContext(LabContext)
  return <section className="remote" data-testid="portal">
    <div className="remote-top"><span>03 / PORTAL</span><span>:4103</span></div>
    <h2>Beyond the tree.</h2>
    <p>A remote portal into the host document.</p>
    <div className="portal-symbol" aria-hidden="true">↗</div>
    <div className="buttons"><button onClick={() => setOpen(true)}>Open remote portal</button></div>
    <div className="readout">Shares the host DOM renderer.</div>
    {open && createPortal(<div className="portal-overlay" role="dialog" aria-modal="true" aria-label="Remote portal">
      <div className="portal-content"><span className="eyebrow">REMOTE 03 → DOCUMENT.BODY</span><h2>Context crossed the portal.</h2>
        <p>Host count: <strong data-testid="portal-count">{count}</strong></p>
        <button onClick={increment}>Increment inside portal</button><button className="secondary" onClick={() => setOpen(false)}>Close portal</button>
      </div>
    </div>, document.body)}
  </section>
}
