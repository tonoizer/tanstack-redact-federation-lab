import { createContext } from 'react'

export const LabContext = createContext({
  count: -1,
  message: 'DEFAULT: provider was not received',
  increment: () => {},
})
