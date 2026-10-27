import { useState, useContext, createElement } from 'react'
import { LabContext } from '@lab/contract'

export const identity = { useState, useContext, createElement, LabContext }

export default function ContextReader() {
  const { count, message, increment } = useContext(LabContext)
  return <section className="remote" data-testid="context">
    <div className="remote-top"><span>02 / CONTEXT</span><span>:4102</span></div>
    <h2>One conversation.</h2>
    <p>A shared context object. A host-owned provider.</p>
    <blockquote data-testid="context-message">{message}</blockquote>
    <div className="buttons"><button onClick={increment}>Update from context remote</button></div>
    <div className="readout">Shared count <b data-testid="context-count">{count}</b></div>
  </section>
}
