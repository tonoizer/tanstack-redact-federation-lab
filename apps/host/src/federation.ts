import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as JSX from 'react/jsx-runtime'
import * as Contract from '@lab/contract'
import { createInstance } from '@module-federation/enhanced/runtime'
import type { ComponentType } from 'react'

const modules = {
  react: React,
  'react/jsx-runtime': JSX,
  'react/jsx-dev-runtime': JSX,
  'react-dom': ReactDOM,
  'react-dom/client': ReactDOMClient,
  '@lab/contract': Contract,
}

// Runtime API keeps federation client-only and out of Start's server module graph.
export const mf = createInstance({
  name: 'start_host',
  remotes: Object.entries(__LAB_REMOTES__).map(([name, entry]) => ({
    name, entry, type: 'module',
  })),
  shared: Object.fromEntries(Object.entries(modules).map(([key, value]) => [key, {
    version: key === '@lab/contract' ? '1.0.0' : __LAB_SCENARIO__ === 'react' ? '19.3.1' : '0.2.1',
    lib: () => value,
    shareConfig: { singleton: true, requiredVersion: false },
  }])),
})

export interface RemoteModule {
  default: ComponentType
  identity: { useState: unknown; useContext: unknown; createElement: unknown; createPortal?: unknown; LabContext: unknown }
}

export async function loadWidget(name: string) {
  const module = await mf.loadRemote<RemoteModule>(`${name}/Widget`)
  if (!module) throw new Error(`No module returned for ${name}`)
  const id = module.identity
  const checks = {
    useState: id.useState === React.useState,
    useContext: id.useContext === React.useContext,
    createElement: id.createElement === React.createElement,
    contextObject: id.LabContext === Contract.LabContext,
    ...(id.createPortal ? { createPortal: id.createPortal === ReactDOM.createPortal } : {}),
  }
  return { module, checks }
}
