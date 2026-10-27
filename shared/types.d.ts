declare module '@lab/contract' {
  export const LabContext: import('react').Context<{
    count: number
    message: string
    increment: () => void
  }>
}
declare const __LAB_SCENARIO__: string
declare const __LAB_REMOTES__: Record<string, string>
declare const __LAB_OPTIMIZED__: boolean
declare module '@lab/runtime-provider' {
  export const plugins: import('@module-federation/enhanced/runtime').ModuleFederationRuntimePlugin[]
}
