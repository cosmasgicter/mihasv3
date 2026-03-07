export interface DevApiProxyRule {
  target: string
  changeOrigin: boolean
  secure: boolean
}

export type DevApiProxyConfig = Record<string, DevApiProxyRule>

function normalizeTarget(value: string): string {
  return value.replace(/\/$/, '')
}

export function resolveDevApiProxyTarget(env: Record<string, string | undefined>): string {
  const explicitTarget = env.VITE_DEV_API_PROXY_TARGET?.trim()
  if (explicitTarget) {
    return normalizeTarget(explicitTarget)
  }

  const apiPort = env.VITE_DEV_API_PORT?.trim() || '3001'
  return `http://127.0.0.1:${apiPort}`
}

export function createDevApiProxyConfig(
  env: Record<string, string | undefined>
): DevApiProxyConfig {
  const target = resolveDevApiProxyTarget(env)

  return {
    '/api': {
      target,
      changeOrigin: true,
      secure: false,
    }
  }
}
