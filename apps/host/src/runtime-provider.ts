import inject from '@module-federation/vite/injectExternalRuntimeCorePlugin'
import type { ModuleFederationRuntimePlugin } from '@module-federation/enhanced/runtime'

const provider = inject()
export const plugins: ModuleFederationRuntimePlugin[] = [{
  ...provider,
  // Preserve the full hook args; the provider package types only its `options` field.
  beforeInit(args) { provider.beforeInit(args); return args },
}]
